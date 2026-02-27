const db = require('../database');
const events = require('../events.json');
const { EmbedBuilder } = require('discord.js');
const colors = require('../colors.json');

/**
 * Sistema de Eventos Semanais
 * Gerencia a rotação e aplicação de efeitos de eventos globais.
 */

async function getWeeklyEvent() {
    return await db.getGlobalConfig('current_weekly_event');
}

async function setWeeklyEvent(eventData) {
    return await db.saveGlobalConfig('current_weekly_event', eventData);
}

async function rotateWeeklyEvent(client) {
    console.log('🔄 [EVENT SYSTEM] Iniciando rotação de evento semanal...');
    
    // 1. Carregar histórico recente para evitar repetição
    const history = await db.getGlobalConfig('event_history') || [];
    const currentEvent = await getWeeklyEvent();
    
    // Se já tiver evento e ainda não expirou (opcional, mas aqui vamos forçar rotação se chamado)
    // Vamos assumir que o scheduler chama isso apenas quando DEVE mudar.

    // 2. Definir pesos baseados no tipo
    // Good: 10 eventos (comum)
    // Bad: 4 eventos (incomum)
    // Rare: 2 eventos (raro)
    
    // Probabilidades: 
    // Good: 60%
    // Bad: 30%
    // Rare: 10%
    
    let pool = [];
    
    // Adiciona eventos ao pool com base na raridade
    for (const event of events.events) {
        let weight = 0;
        
        if (event.type === 'good') weight = 60 / 10; // 6% cada
        if (event.type === 'bad') weight = 30 / 4;   // 7.5% cada
        if (event.type === 'rare') weight = 10 / 2;  // 5% cada

        // Reduz peso se esteve ativo recentemente
        const lastSeenIndex = history.findIndex(h => h === event.id);
        if (lastSeenIndex !== -1) {
            // Se foi o último (index 0), peso cai drasticamente (10%)
            // Se foi penúltimo (index 1), peso cai (50%)
            if (lastSeenIndex === 0) weight *= 0.1;
            else if (lastSeenIndex === 1) weight *= 0.5;
        }

        // Adiciona N entradas no pool para simular peso (simplificado)
        // Multiplicamos por 10 para ter inteiros
        const entries = Math.max(1, Math.round(weight * 10));
        for (let i = 0; i < entries; i++) {
            pool.push(event);
        }
    }

    // 3. Sortear
    const selectedEvent = pool[Math.floor(Math.random() * pool.length)];
    
    // 4. Salvar novo evento e atualizar histórico
    const newHistory = [selectedEvent.id, ...history].slice(0, 4); // Mantém últimos 4
    
    await setWeeklyEvent({
        id: selectedEvent.id,
        name: selectedEvent.name,
        description: selectedEvent.description,
        type: selectedEvent.type,
        effects: selectedEvent.effects,
        startedAt: Date.now(),
        expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 dias
    });
    
    await db.saveGlobalConfig('event_history', newHistory);

    console.log(`✅ [EVENT SYSTEM] Novo evento definido: ${selectedEvent.name}`);

    // --- ANÚNCIO GLOBAL ---
    if (client) {
        console.log('📢 [EVENT SYSTEM] Anunciando novo evento nos canais de economia...');
        
        const embed = new EmbedBuilder()
            .setTitle(`🌍 NOVO EVENTO GLOBAL: ${selectedEvent.name}`)
            .setDescription(`**${selectedEvent.description}**\n\nEste evento afeta todos os jogadores do servidor durante esta semana!`)
            .setColor(selectedEvent.type === 'good' ? colors.success : (selectedEvent.type === 'bad' ? colors.error : colors.gold))
            .addFields(
                { name: '⏳ Duração', value: '7 dias', inline: true },
                { name: '📊 Tipo', value: selectedEvent.type.toUpperCase(), inline: true }
            )
            .setFooter({ text: 'Use /evento para ver os efeitos detalhados.' })
            .setTimestamp();

        // Iterar sobre todas as guildas
        for (const [guildId, guild] of client.guilds.cache) {
            try {
                const guildConfig = await db.getGuildConfig(guildId);
                if (guildConfig && guildConfig.economyLogChannel) {
                    const channel = await client.channels.fetch(guildConfig.economyLogChannel).catch(() => null);
                    if (channel && channel.isTextBased()) {
                        await channel.send({ embeds: [embed] });
                        console.log(`📨 [EVENT SYSTEM] Anúncio enviado para guilda ${guild.name} (Canal: ${channel.name})`);
                    }
                }
            } catch (err) {
                console.error(`❌ [EVENT SYSTEM] Falha ao anunciar na guilda ${guildId}:`, err);
            }
        }
    }

    return selectedEvent;
}

// Helper para aplicar multiplicadores de forma segura
// Uso: const bonus = getEventMultiplier(event, 'work_money_mult'); // retorna 1.0 ou 1.5 etc
function getEventMultiplier(event, effectKey, defaultValue = 1.0) {
    if (!event || !event.effects || event.effects[effectKey] === undefined) {
        return defaultValue;
    }
    return event.effects[effectKey];
}

module.exports = { getWeeklyEvent, setWeeklyEvent, rotateWeeklyEvent, getEventMultiplier };
