const db = require('../database');
const items = require('../items.json');
const petItems = require('../pet_items.json');

const MISSION_TYPES = {
    MESSAGE: 'message',
    WORK: 'work',
    GAMBLE_WIN: 'gamble_win',
    PET_PLAY: 'pet_play',
    DAILY_CLAIM: 'daily_claim',
    SLOTS_PLAY: 'slots_play',
    COINFLIP_WIN: 'coinflip_win',
    ROB_ATTEMPT: 'rob_attempt',
    PPT_WIN: 'ppt_win',
    HILO_PLAY: 'hilo_play',
    PAR_IMPAR_WIN: 'par_impar_win'
};

const MISSION_TEMPLATES = [
    { type: MISSION_TYPES.MESSAGE, description: "Envie {goal} mensagens no chat", min: 50, max: 200, rewardMin: 300, rewardMax: 500 },
    { type: MISSION_TYPES.WORK, description: "Trabalhe {goal} vezes", min: 3, max: 10, rewardMin: 300, rewardMax: 500 },
    { type: MISSION_TYPES.GAMBLE_WIN, description: "Vença {goal} apostas (Coinflip/Slots/Duelo)", min: 3, max: 8, rewardMin: 300, rewardMax: 500 },
    { type: MISSION_TYPES.PET_PLAY, description: "Brinque com seu pet {goal} vezes", min: 3, max: 8, rewardMin: 300, rewardMax: 500 },
    { type: MISSION_TYPES.DAILY_CLAIM, description: "Resgate seu prêmio diário", min: 1, max: 1, rewardMin: 300, rewardMax: 500 },
    { type: MISSION_TYPES.SLOTS_PLAY, description: "Jogue no Slots {goal} vezes", min: 4, max: 6, rewardMin: 300, rewardMax: 500 },
    { type: MISSION_TYPES.COINFLIP_WIN, description: "Vença {goal} Coinflips", min: 2, max: 5, rewardMin: 300, rewardMax: 500 },
    { type: MISSION_TYPES.ROB_ATTEMPT, description: "Tente roubar alguém {goal} vezes", min: 3, max: 8, rewardMin: 400, rewardMax: 600 },
    { type: MISSION_TYPES.PPT_WIN, description: "Vença {goal} jogos de Pedra, Papel e Tesoura", min: 3, max: 8, rewardMin: 300, rewardMax: 500 },
    { type: MISSION_TYPES.HILO_PLAY, description: "Jogue Hi-Lo {goal} vezes", min: 4, max: 6, rewardMin: 300, rewardMax: 500 },
    { type: MISSION_TYPES.PAR_IMPAR_WIN, description: "Vença no Par ou Ímpar {goal} vezes", min: 2, max: 5, rewardMin: 400, rewardMax: 700 }
];

function getLocalTodayString() {
    const now = new Date();
    const [day, month, year] = now.toLocaleDateString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).split('/');
    return `${year}-${month}-${day}`;
}

// Gera 3 missões aleatórias para o dia
function generateDailyMissions(context = null) {
    const today = getLocalTodayString();
    const missions = [];
    const shuffled = MISSION_TEMPLATES.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 3);

    for (const template of selected) {
        const goal = Math.floor(Math.random() * (template.max - template.min + 1)) + template.min;
        
        let description = template.description.replace('{goal}', goal);
        let targetChannelId = null;

        // Se for missão de mensagem e tivermos contexto de guilda, escolhe um canal aleatório
        if (template.type === MISSION_TYPES.MESSAGE && context && context.guild) {
            try {
                const { ChannelType, PermissionsBitField } = require('discord.js');
                
                const channels = context.guild.channels.cache.filter(c => 
                    c.type === ChannelType.GuildText &&
                    c.permissionsFor(context.guild.members.me).has(PermissionsBitField.Flags.SendMessages) &&
                    c.permissionsFor(context.guild.members.me).has(PermissionsBitField.Flags.ViewChannel)
                );

                if (channels.size > 0) {
                    const randomChannel = channels.random();
                    targetChannelId = randomChannel.id;
                    description += ` no canal <#${targetChannelId}>`;
                }
            } catch (err) {
                console.error('Erro ao selecionar canal para missão:', err);
            }
        }
        
        // Lógica de Recompensa (Normal vs Bolada)
        let minR = template.rewardMin;
        let maxR = template.rewardMax;
        
        // 5% de chance de Bolada (800-1000)
        if (Math.random() < 0.05) {
            minR = 800;
            maxR = 1000;
        }

        const rewardValue = Math.floor(Math.random() * (maxR - minR + 1)) + minR;
        
        // Chance de item (1%)
        let rewardType = 'money';
        let finalRewardValue = rewardValue;
        
        const rng = Math.random();

        // 0.5% de chance de Ovo Comum ou Raro (Pequena chance)
        if (rng < 0.005) {
            rewardType = 'item';
            // 80% Ovo Comum, 20% Ovo Raro (se disponível)
            if (Math.random() < 0.8) {
                finalRewardValue = 'ovo_comum';
            } else {
                finalRewardValue = 'ovo_raro';
            }
        } 
        // 1.5% de chance de Item Normal (era 1%)
        else if (rng < 0.02) {
            // Tenta pegar item comum ou incomum
            const pool = items.filter(i => i.rarity === 'comum' || i.rarity === 'incomum');
            if (pool.length > 0) {
                const item = pool[Math.floor(Math.random() * pool.length)];
                rewardType = 'item';
                finalRewardValue = item.id;
            }
        }

        missions.push({
            id: Math.random().toString(36).substr(2, 9),
            type: template.type,
            description: description,
            targetChannelId: targetChannelId, // Novo campo
            goal: goal,
            progress: 0,
            completed: false,
            claimed: false,
            rewardType: rewardType,
            rewardValue: finalRewardValue
        });
    }

    return {
        date: today,
        tasks: missions
    };
}

async function checkMission(userId, type, amount = 1, context = null) {
        try {
            const user = await db.getUser(userId);
            if (!user) return;

            const today = getLocalTodayString();
            
            // Se não tiver missões ou for de outro dia, gera novas
            let missions = user.dailyMissions || { date: "", tasks: [] };
        
        if (missions.date !== today) {
            missions = generateDailyMissions(context);
            await db.updateUser(userId, { dailyMissions: missions });
        }

        let updated = false;
        let completedTask = null;

        for (const task of missions.tasks) {
            if (!task.completed && task.type === type) {
                
                // Validação de Canal para Missão de Mensagem
                if (task.targetChannelId && context && context.channel) {
                    if (context.channel.id !== task.targetChannelId) {
                        continue; // Ignora se for o canal errado
                    }
                }

                task.progress += amount;

                if (task.progress >= task.goal) {
                    task.progress = task.goal;
                    task.completed = true;
                    completedTask = task;
                }
                updated = true;
            }
        }

        if (updated) {
            await db.updateUser(userId, { dailyMissions: missions });
            
            // Notificação de conclusão
            if (completedTask && context) {
                const { EmbedBuilder } = require('discord.js');
                const colors = require('../colors.json');

                let rewardDisplay = `${completedTask.rewardValue} ${completedTask.rewardType === 'money' ? 'Foxies' : 'item'}`;
                
                if (completedTask.rewardType === 'item') {
                    const item = items.find(i => i.id === completedTask.rewardValue) || petItems.find(i => i.id === completedTask.rewardValue);
                    if (item) {
                        rewardDisplay = `1x ${item.name}`;
                    }
                }

                const embed = new EmbedBuilder()
                    .setTitle('🎯 Missão Concluída!')
                    .setDescription(`Você completou: **${completedTask.description}**\n\n💰 **Recompensa:** ${rewardDisplay}\nUse \`/missoes\` para resgatar!`)
                    .setColor(colors.success || '#00FF00');

                if (context.channel) {
                    await context.channel.send({ content: `<@${userId}>`, embeds: [embed] }).catch(() => {});
                } else if (context.reply) {
                    // Fallback se context for apenas uma interação sem channel exposto (raro)
                    await context.followUp({ content: `<@${userId}>`, embeds: [embed], ephemeral: false }).catch(() => {});
                }
            }
        }
    } catch (err) {
        console.error(`Erro ao atualizar missão para ${userId}:`, err);
    }
}

module.exports = {
    checkMission,
    generateDailyMissions,
    MISSION_TYPES
};
