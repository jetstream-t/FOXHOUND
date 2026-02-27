const { EmbedBuilder } = require('discord.js');
const db = require('../database');

// Cache para evitar spam de alertas (Cooldown de 6 horas por usuário/tipo)
const alertCache = new Map();

/**
 * Verifica anomalias no banco de dados e notifica o dono.
 * @param {Client} client - Cliente do Discord
 */
async function checkSecurity(client) {
    const OWNER_ID = process.env.OWNER_ID;
    if (!OWNER_ID) return;

    try {
        const anomalies = [];

        // 1. Verificar Saldos Negativos (Bug Crítico)
        const negativeUsers = await db.User.find({
            $or: [
                { wallet: { $lt: 0 } },
                { bank: { $lt: 0 } }
            ]
        }).limit(5);

        for (const user of negativeUsers) {
            anomalies.push({
                type: 'negative_balance',
                userId: user.userId,
                details: `Wallet: ${user.wallet}, Bank: ${user.bank}`,
                severity: 'CRITICAL'
            });
        }

        // 2. Verificar Riqueza Extrema (> 100M) - Exceto Admins Ocultos
        const suspiciousRich = await db.User.find({
            $and: [
                { hideFromRank: false },
                {
                    $or: [
                        { wallet: { $gt: 100000000 } },
                        { bank: { $gt: 100000000 } }
                    ]
                }
            ]
        }).limit(5);

        for (const user of suspiciousRich) {
            anomalies.push({
                type: 'extreme_wealth',
                userId: user.userId,
                details: `Total: ${(user.wallet + user.bank).toLocaleString()}`,
                severity: 'HIGH'
            });
        }

        // 3. Time Travelers (Cooldowns > 1h no futuro)
        const now = Date.now();
        const futureTime = now + (60 * 60 * 1000);
        const timeTravelers = await db.User.find({
            $or: [
                { lastWork: { $gt: futureTime } },
                { lastDaily: { $gt: futureTime } },
                { lastRob: { $gt: futureTime } }
            ]
        }).limit(5);

        for (const user of timeTravelers) {
            anomalies.push({
                type: 'time_travel',
                userId: user.userId,
                details: `Cooldown no futuro detectado`,
                severity: 'MEDIUM'
            });
        }

        // 4. Inventário Anômalo (> 1000 itens iguais, exceto comuns)
        // Scan leve nos top 20 users ativos recentemente
        const topUsers = await db.User.find().sort({ lastInteraction: -1 }).limit(20);
        
        for (const user of topUsers) {
            if (user.inventory) {
                for (const [itemId, qty] of user.inventory) {
                    if (qty > 1000 && itemId !== 'milho' && itemId !== 'racao_comum') {
                        anomalies.push({
                            type: 'inventory_overflow',
                            userId: user.userId,
                            details: `${qty}x ${itemId}`,
                            severity: 'MEDIUM'
                        });
                    }
                }
            }
        }

        // Processar Alertas
        if (anomalies.length > 0) {
            const owner = await client.users.fetch(OWNER_ID).catch(() => null);
            if (!owner) return;

            const newAnomalies = [];

            for (const anomaly of anomalies) {
                const cacheKey = `${anomaly.userId}_${anomaly.type}`;
                const lastAlert = alertCache.get(cacheKey);
                const cooldown = 6 * 60 * 60 * 1000; // 6 horas

                if (!lastAlert || (now - lastAlert > cooldown)) {
                    newAnomalies.push(anomaly);
                    alertCache.set(cacheKey, now);
                }
            }

            if (newAnomalies.length > 0) {
                const embed = new EmbedBuilder()
                    .setTitle('🚨 ALERTA DE SEGURANÇA FOXHOUND')
                    .setDescription(`Foram detectadas **${newAnomalies.length}** novas atividades suspeitas.`)
                    .setColor('#FF0000')
                    .setTimestamp();

                const fields = newAnomalies.map(a => {
                    const icon = a.severity === 'CRITICAL' ? '🔥' : (a.severity === 'HIGH' ? '⚠️' : 'ℹ️');
                    return {
                        name: `${icon} ${a.type.toUpperCase()} (<@${a.userId}>)`,
                        value: `**Detalhes:** ${a.details}\n**ID:** \`${a.userId}\``
                    };
                });

                // Discord limita fields a 25, vamos cortar se precisar
                embed.addFields(fields.slice(0, 25));

                await owner.send({ embeds: [embed] }).catch(err => console.error('Falha ao enviar DM para Owner:', err));
                console.log(`🚨 [SECURITY] Enviado alerta de ${newAnomalies.length} anomalias para o dono.`);
            }
        }

        // Limpar cache antigo (opcional, para não crescer infinitamente)
        if (alertCache.size > 1000) {
            alertCache.clear(); // Limpeza bruta por enquanto
        }

    } catch (error) {
        console.error('❌ [SECURITY] Erro na verificação de segurança:', error);
    }
}

module.exports = { checkSecurity };
