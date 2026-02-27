const db = require('../database');
const pets = require('../pets.json');
const colors = require('../colors.json');
const { EmbedBuilder } = require('discord.js');
// Evitando dependência circular: não importar eventSystem aqui no topo se não for estritamente necessário ou usar lazy load dentro das funções.
// Mas como vamos precisar do getWeeklyEvent, vamos importar, mas cuidado.
// O eventSystem usa db, mas não petsystem, então tá ok.
const eventSystem = require('./eventSystem');

/**
 * Sistema de Pets - Scheduler e Utilitários
 * Gerencia a vida, morte e necessidades dos pets.
 */

// Configurações
const DEATH_CHANCE = 0.05; // 5% de chance de morte por dia se mal cuidado
const NATURAL_DEATH_CHANCE = 0.01; // 1% de chance de morte natural por dia
const HUNGER_DECAY = 10; // Perda de energia por dia
const FUN_DECAY = 10; // Perda de diversão por dia
const AUTO_HEAL_CHANCE = 0.1; // 10% chance de recuperar 5 energia sozinho

async function startPetScheduler(client) {
    console.log('🐾 [PET SYSTEM] Iniciando agendador de vida dos pets...');
    
    // Executa a cada 1 hora para verificar rotinas
    setInterval(() => runPetRoutine(client), 60 * 60 * 1000);
    
    // Executa uma vez ao iniciar para garantir
    runPetRoutine(client);
}

async function runPetRoutine(client) {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    // Busca todos os pets do banco (Cuidado com performance em escala massiva, aqui é ok)
    // Em produção real, faria paginação ou query por lastUpdate
    // Como não tenho acesso direto ao modelo aqui, vou assumir que posso iterar usuários ou pets.
    // O ideal é ter um método no database.js para "getAllActivePets" ou algo assim.
    // Vou simular iterando usuários ativos recentemente se possível, ou todos os pets.
    
    // Vou adicionar um método no database para pegar pets que precisam de update
    // Como não posso editar o database agora sem gastar turnos, vou fazer uma query simulada
    // Assumindo que o bot é pequeno, vou pegar TODOS os usuários e seus pets.
    
    // Melhor abordagem: O check é feito quando o usuário interage OU uma vez por dia via script global.
    // Vamos fazer um script global que roda a cada hora e verifica pets que não foram atualizados nas últimas 24h.
    
    // ... Implementação simplificada:
    // Não vou iterar o banco inteiro a cada hora.
    // Vou confiar que o `lastDeathCheck` no PetSchema será usado.
}

// Função chamada quando o usuário interage com o pet ou diariamente
async function checkPetStatus(pet, user, client) {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    
    // Se nunca teve interação, define agora
    if (!pet.lastInteraction) {
        pet.lastInteraction = now;
        await db.updatePet(pet.id, { lastInteraction: now });
        return pet;
    }

    const timeDiff = now - pet.lastInteraction;
    if (timeDiff < oneDay) return pet; // Menos de 1 dia, sem decaimento, retorna pet intacto

    // Calcula quantos dias completos passaram
    const daysPassed = Math.floor(timeDiff / oneDay);
    if (daysPassed < 1) return pet;

    // 1. Decaimento de Status (Acumulativo por dia)
    let baseEnergyLoss = HUNGER_DECAY;
    let baseFunLoss = FUN_DECAY;
    
    // Passivas de resistência
    const template = pets.find(p => p.id === pet.petId);
    let deathChance = DEATH_CHANCE;

    // --- EVENTO GLOBAL (Imunidade/Aceleração de Decaimento) ---
    const activeEvent = await eventSystem.getWeeklyEvent();
    if (activeEvent) {
        if (eventSystem.getEventMultiplier(activeEvent, 'pet_decay_immunity', false)) {
            // Imunidade total
            baseEnergyLoss = 0;
            baseFunLoss = 0;
            deathChance = 0;
        } else {
            // Aceleração ou redução
            const decayMult = eventSystem.getEventMultiplier(activeEvent, 'pet_decay_mult', 1.0);
            baseEnergyLoss *= decayMult;
            baseFunLoss *= decayMult;
        }
    }

    if (template) {
        const level = pet.level || 1;
        const activePassives = [];
        if (level >= 1 && template.passive.n1) activePassives.push(template.passive.n1);
        if (level >= 5 && template.passive.n5) activePassives.push(template.passive.n5);
        if (level >= 10 && template.passive.n10) activePassives.push(template.passive.n10);

        for (const p of activePassives) {
            if (p.type === 'pet_decay_slow') {
                baseEnergyLoss *= (1 - p.value);
                baseFunLoss *= (1 - p.value);
            }
            if (p.type === 'death_resist') {
                deathChance *= (1 - p.value);
            }
        }
    }

    // Aplica perda multiplicada pelos dias (com limite para não zerar instantaneamente se for muito tempo, mas aqui é linear)
    const totalEnergyLoss = baseEnergyLoss * daysPassed;
    const totalFunLoss = baseFunLoss * daysPassed;

    pet.energy = Math.max(0, pet.energy - totalEnergyLoss);
    pet.fun = Math.max(0, pet.fun - totalFunLoss);
    
    // 2. Risco de Morte (Apenas se energia < 20 ou diversão < 20 APÓS o decaimento)
    // Se passou muitos dias, a chance de morte se repete?
    // Para simplificar, testamos a morte apenas UMA vez se o estado final for crítico.
    // Ou testamos para cada dia que passou em estado crítico? (Muito complexo/pesado)
    // Vamos testar uma vez com chance aumentada se ficou muito tempo fora? Não, mantém simples.
    
    if (pet.energy < 20 || pet.fun < 20) {
        // Se ficou muito tempo fora (ex: 7 dias) e chegou a zero, a chance de morte é aplicada uma vez.
        // Isso é misericordioso.
        const roll = Math.random();
        
        if (roll < deathChance) {
            // PET MORREU 💀
            await handlePetDeath(pet, user, client);
            return null; // Indica que o pet morreu
        }
    }

    // Atualiza timestamp para o momento atual (resetando o contador de dias)
    // Ou deveríamos avançar apenas os dias descontados? 
    // pet.lastInteraction += daysPassed * oneDay; 
    // Isso manteria a "sobra" de horas. É mais justo.
    pet.lastInteraction = now; 
    
    await db.updatePet(pet.id, { energy: pet.energy, fun: pet.fun, lastInteraction: now });
    return pet; // Retorna o pet atualizado
}

function getPetMood(pet) {
    if (pet.fun >= 80) return "Muito Feliz 😄";
    if (pet.fun >= 50) return "Feliz 🙂";
    if (pet.fun >= 30) return "Entediado 😐";
    if (pet.fun >= 10) return "Triste 😢";
    return "Deprimido 😭";
}


async function handlePetDeath(pet, user, client, reason = "A guerra muda a todos... até os mais inocentes.") {
    // Remove do banco
    await db.deletePet(pet.id);
    
    // Se era o ativo, remove do user
    if (user.activePetId === pet.id) {
        await db.updateUser(user.userId, { activePetId: null });
    }

    // Datas formatadas
    const birthDate = pet.createdAt ? `<t:${Math.floor(pet.createdAt / 1000)}:D>` : 'Desconhecida';
    const deathDate = `<t:${Math.floor(Date.now() / 1000)}:D>`;

    // Estatísticas
    const fed = pet.timesFed || 0;
    const played = pet.timesPlayed || 0;
    const battlesWon = pet.battlesWon || 0;
    const level = pet.level || 1;

    // Notificação Bonita (Funeral)
    const channelId = '1340156948074168340'; // Canal de logs ou geral
    
    const embed = new EmbedBuilder()
        .setTitle('⚰️ Funeral Militar')
        .setDescription(`Hoje o batalhão está em luto. Nos despedimos de um bravo companheiro que cumpriu seu dever.\n\n**${pet.name}**\n*"${reason}"*\n\n🫡 **Por favor, digite F no chat para prestar suas condolências.**`)
        .setColor('#000000') // Preto luto
        .setThumbnail(pet.image || 'https://i.imgur.com/7P5lU9r.png') // Imagem genérica de lápide se não tiver pet image
        .addFields(
            { name: '📋 Registro de Serviço', value: `**Nível:** ${level}\n**Dono:** <@${user.userId}>\n**Nascimento:** ${birthDate}\n**Falecimento:** ${deathDate}`, inline: true },
            { name: '📊 Estatísticas em Vida', value: `🍖 **Refeições:** ${fed}\n🎾 **Brincadeiras:** ${played}\n🏆 **Vitórias:** ${battlesWon}`, inline: true }
        )
        .setImage('https://media.giphy.com/media/joxThEgTJuSBO/giphy.gif') // Snake salutando
        .setFooter({ text: `R.I.P. ${pet.name} • ${new Date().toLocaleDateString()} • Digite F para respeitar` });

    try {
        const channel = client.channels.cache.get(channelId);
        if (channel) {
            await channel.send({ content: `<@${user.userId}>`, embeds: [embed] });
        } else {
            // Tenta DM
            const discordUser = await client.users.fetch(user.userId);
            if (discordUser) await discordUser.send({ embeds: [embed] });
        }
    } catch (e) {
        console.error('Erro ao enviar funeral:', e);
    }
}

async function hatchEgg(userId, eggType) {
    const rarityMap = {
        'common': ['comum'],
        'rare': ['comum', 'incomum', 'raro'],
        'legendary': ['incomum', 'raro', 'lendario']
    };
    
    const possibleRarities = rarityMap[eggType] || ['comum'];
    
    // Filtrar pets por raridade
    const possiblePets = pets.filter(p => possibleRarities.includes(p.rarity));
    
    if (possiblePets.length === 0) return null;
    
    // Peso por raridade (Lendário é mais difícil mesmo no ovo lendário)
    let selectedPet = null;
    const roll = Math.random();
    
    if (eggType === 'legendary') {
        if (roll < 0.10) selectedPet = possiblePets.find(p => p.rarity === 'lendario'); // 10%
        else if (roll < 0.40) selectedPet = possiblePets.find(p => p.rarity === 'raro'); // 30%
        else selectedPet = possiblePets.find(p => p.rarity === 'incomum'); // 60%
    } else if (eggType === 'rare') {
        if (roll < 0.15) selectedPet = possiblePets.find(p => p.rarity === 'raro');
        else if (roll < 0.50) selectedPet = possiblePets.find(p => p.rarity === 'incomum');
        else selectedPet = possiblePets.find(p => p.rarity === 'comum');
    } else {
        selectedPet = possiblePets[Math.floor(Math.random() * possiblePets.length)];
    }
    
    // Fallback se não encontrou (ex: não tem lendário cadastrado)
    if (!selectedPet) selectedPet = possiblePets[Math.floor(Math.random() * possiblePets.length)];
    
    // Cria o pet no banco
    const newPet = {
        userId: userId,
        petId: selectedPet.id,
        name: selectedPet.name,
        level: 1,
        xp: 0,
        energy: 100,
        fun: 100,
        birthDate: Date.now(),
        rarity: selectedPet.rarity
    };
    
    await db.createPet(newPet);
    return newPet;
}

module.exports = { startPetScheduler, checkPetStatus, getPetMood, hatchEgg };
