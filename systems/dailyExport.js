const fs = require('fs');
const path = require('path');
const db = require('../database');

/**
 * Sistema de Exportação Diária de Métricas Econômicas
 * Gera um arquivo CSV com o snapshot da economia.
 */

const { EmbedBuilder } = require('discord.js');

const EXPORT_DIR = path.join(__dirname, '../exports');
const EXPORT_FILE = path.join(EXPORT_DIR, 'economia-diaria.csv');
const ALERTS_LOG_FILE = path.join(EXPORT_DIR, 'alerts-log.csv');

// Configurações de Alerta (Padrão)
const ALERT_CONFIG = {
    INFLATION_THRESHOLD_PERCENT: 10, // 10% de crescimento diário
    WEALTH_CONCENTRATION_THRESHOLD: 60, // Top 10 > 60% da economia
    LOAN_RISK_THRESHOLD_PERCENT: 60 // Valor emprestado > 60% da economia
};

async function runDailyExport(client, manual = false) {
    console.log('📊 [EXPORT] Iniciando exportação de métricas da economia...');

    // 1. Verificar se já rodou hoje (apenas se não for manual)
    const now = new Date();
    // Horário de Brasília
    const brtDateString = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const [day, month, year] = brtDateString.split('/');
    const todayISO = `${year}-${month}-${day}`;

    if (!manual) {
        const lastExportDate = await db.GlobalConfig.findOne({ key: 'last_daily_export_date' });
        if (lastExportDate && lastExportDate.value === todayISO) {
            // Já rodou hoje
            return { success: false, message: 'Exportação já realizada hoje.' };
        }
    }

    try {
        // 2. Coletar Dados
        const users = await db.User.find({});
        
        let totalWallet = 0;
        let totalBank = 0;
        let activeUsers24h = 0;
        let totalLoansActive = 0;
        let totalLoanedValue = 0;
        let maxBalance = -1;
        let richestUserId = '';
        let totalTransactions = 0; // Aproximação via dailyTransferCount + dailyGambles
        let generatedToday = 0; // Aproximação via voiceEarningsToday
        let removedToday = 0; // Aproximação via purchaseHistory

        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);

        for (const user of users) {
            // Totais
            totalWallet += user.wallet || 0;
            totalBank += user.bank || 0;

            // Ativos nas últimas 24h
            const lastActivity = Math.max(
                user.lastWork || 0, 
                user.lastDaily || 0, 
                user.lastRob || 0, 
                user.lastVoiceDate ? new Date(user.lastVoiceDate).getTime() : 0
            );
            if (lastActivity > oneDayAgo) {
                activeUsers24h++;
            }

            // Empréstimos
            if (user.loan && user.loan.active) {
                totalLoansActive++;
                totalLoanedValue += user.loan.amount || 0;
            }

            // Richest
            const totalUserMoney = (user.wallet || 0) + (user.bank || 0);
            if (totalUserMoney > maxBalance) {
                // Ignorar God Mode do ranking de 'Richest' se desejar, mas para métricas puras, talvez seja bom incluir ou marcar
                // Vamos incluir, mas marcar se for godmode
                if (!user.hideFromRank) {
                    maxBalance = totalUserMoney;
                    richestUserId = user.userId;
                }
            }

            // Transações (Aproximação)
            // Nota: dailyTransferCount e dailyGambles podem não zerar corretamente em algumas versões,
            // mas assumindo que zeram no reset diário:
            totalTransactions += (user.dailyTransferCount || 0) + (user.dailyGambles || 0);

            // Gerado (Aproximação)
            generatedToday += (user.voiceEarningsToday || 0);

            // Removido (Compras de hoje)
            if (user.purchaseHistory && Array.isArray(user.purchaseHistory)) {
                // purchaseHistory: [{ item, price, date }]
                const todayPurchases = user.purchaseHistory.filter(p => p.date > oneDayAgo); // Aproximação 24h
                // Para ser exato com "hoje" (dia civil), precisaríamos comparar datas, mas 24h rolling window é bom para snapshots
                for (const purchase of todayPurchases) {
                    removedToday += (purchase.price || 0);
                }
            }
        }

        const totalEconomy = totalWallet + totalBank;
        const userCount = users.length;
        const avgBalance = userCount > 0 ? (totalEconomy / userCount) : 0;

        // 2.1 Riqueza Concentrada (Top 10)
        // Ordena usuários por saldo total (wallet + bank)
        const sortedUsers = users
            .filter(u => !u.hideFromRank) // Opcional: Ignorar God Mode/Admins ocultos para métrica real
            .map(u => ({
                id: u.userId,
                total: (u.wallet || 0) + (u.bank || 0)
            }))
            .sort((a, b) => b.total - a.total);

        const top10 = sortedUsers.slice(0, 10);
        const top10Total = top10.reduce((acc, curr) => acc + curr.total, 0);
        
        let wealthConcentration = 0;
        if (totalEconomy > 0) {
            wealthConcentration = (top10Total / totalEconomy) * 100;
        }

        // 3. Preparar CSV
        // Cabeçalho: Data,Timestamp,DinheiroTotal,VariaçãoEconomia,UsuariosTotal,UsuariosAtivos,BancoTotal,CarteiraTotal,EmprestimosAtivos,ValorEmprestado,MediaSaldo,UsuarioMaisRico,ConcentracaoRiquezaTop10,TransacoesDia,GeradoDia,RemovidoDia
        
        // 3.1 Calcular Delta
        let economyDelta = 0;
        
        if (!fs.existsSync(EXPORT_DIR)) {
            fs.mkdirSync(EXPORT_DIR, { recursive: true });
        }

        // Tentar ler a última linha para pegar o DinheiroTotal anterior
        if (fs.existsSync(EXPORT_FILE)) {
            const content = fs.readFileSync(EXPORT_FILE, 'utf8');
            const lines = content.trim().split('\n');
            
            // Pega a última linha de dados (ignora cabeçalho se só tiver ele)
            if (lines.length > 1) {
                const lastLine = lines[lines.length - 1];
                const columns = lastLine.split(',');
                
                // Assumindo que a coluna DinheiroTotal é a de índice 2 (baseado no novo layout) ou índice 1 (no antigo)
                // Vamos precisar lidar com a migração de layout.
                // Layout Antigo: Data(0), DinheiroTotal(1), ...
                // Layout Novo: Data(0), Timestamp(1), DinheiroTotal(2), Variação(3), ...
                
                // Se a linha tiver menos colunas que o novo layout, provavelmente é layout antigo.
                // Mas para calcular delta, precisamos saber onde está o Total.
                // Se for layout antigo (13 colunas), Total é index 1.
                // Se for layout novo (16 colunas), Total é index 2.
                
                let lastTotal = 0;
                if (columns.length === 13) {
                    lastTotal = parseFloat(columns[1]);
                } else if (columns.length >= 16) {
                    lastTotal = parseFloat(columns[2]);
                }
                
                if (!isNaN(lastTotal)) {
                    economyDelta = totalEconomy - lastTotal;
                }
            }
        }

        const timestamp = now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }); // HH:mm:ss
        const deltaSign = economyDelta >= 0 ? '+' : '';

        const csvLine = [
            todayISO,
            timestamp,
            totalEconomy.toFixed(2),
            `${deltaSign}${economyDelta.toFixed(2)}`,
            userCount,
            activeUsers24h,
            totalBank.toFixed(2),
            totalWallet.toFixed(2),
            totalLoansActive,
            totalLoanedValue.toFixed(2),
            avgBalance.toFixed(2),
            richestUserId,
            maxBalance.toFixed(2),
            `${wealthConcentration.toFixed(2)}%`,
            totalTransactions,
            generatedToday.toFixed(2),
            removedToday.toFixed(2)
        ].join(',') + '\n';

        const header = 'Data,Timestamp,DinheiroTotal,VariaçãoEconomia,UsuariosTotal,UsuariosAtivos,BancoTotal,CarteiraTotal,EmprestimosAtivos,ValorEmprestado,MediaSaldo,UsuarioMaisRicoID,UsuarioMaisRicoSaldo,ConcentracaoRiquezaTop10,TransacoesDia,GeradoDia,RemovidoDia\n';

        if (!fs.existsSync(EXPORT_FILE)) {
            fs.writeFileSync(EXPORT_FILE, header + csvLine, 'utf8');
        } else {
            // Verificar cabeçalho para migração
            const content = fs.readFileSync(EXPORT_FILE, 'utf8');
            const lines = content.split('\n');
            const firstLine = lines[0].trim();
            
            // Verifica se o cabeçalho é diferente do atual
            if (firstLine !== header.trim()) {
                 // Header antigo detectado (ou diferente): Renomear e criar novo
                 const backupName = path.join(EXPORT_DIR, `economia-diaria-backup-${Date.now()}.csv`);
                 fs.renameSync(EXPORT_FILE, backupName);
                 // Cria novo com header novo
                 fs.writeFileSync(EXPORT_FILE, header + csvLine, 'utf8');
                 return { success: true, message: `Layout atualizado! Arquivo antigo salvo como backup. Novo arquivo: ${EXPORT_FILE}` };
            }
            
            // Check if last line is today (prevent dupe)
            const lastLine = lines[lines.length - 2];
            if (lastLine && lastLine.startsWith(todayISO) && !manual) {
                return { success: false, message: 'Registro já existente para hoje.' };
            }
            
            fs.appendFileSync(EXPORT_FILE, csvLine, 'utf8');
        }

        // 5. Atualizar Flag Global (se não for manual)
        if (!manual) {
            await db.GlobalConfig.findOneAndUpdate(
                { key: 'last_daily_export_date' },
                { value: todayISO },
                { upsert: true }
            );
        }

        // 6. Verificar Alertas de Economia (Novo)
        // Só dispara se tiver client disponível (scheduler ou godmode) e se não for manual (para evitar spam, ou incluir manual?)
        // Vamos incluir manual também, pois é útil ver se o alerta dispara.
        
        if (client) {
            const alerts = [];
            const logEntries = [];

            // 🚨 1. ALERTA DE INFLAÇÃO ANORMAL (Variação > X%)
            // Só calcula se economyDelta for positivo e tiver base anterior
            if (economyDelta > 0 && (totalEconomy - economyDelta) > 0) {
                const previousTotal = totalEconomy - economyDelta;
                const inflationPercent = (economyDelta / previousTotal) * 100;
                
                if (inflationPercent > ALERT_CONFIG.INFLATION_THRESHOLD_PERCENT) {
                    alerts.push({
                        title: '🚨 ALERTA DE INFLAÇÃO ANORMAL',
                        desc: `A economia cresceu **${inflationPercent.toFixed(2)}%** em um dia!\n` +
                              `Delta: **+${economyDelta.toFixed(2)}**\n` +
                              `Isso pode indicar bugs, duplicação ou exploits.`
                    });
                    logEntries.push({
                        type: 'Inflacao',
                        value: `${inflationPercent.toFixed(2)}%`,
                        limit: `${ALERT_CONFIG.INFLATION_THRESHOLD_PERCENT}%`,
                        desc: 'Crescimento acima do permitido'
                    });
                }
            }

            // 🚨 2. ALERTA DE CONCENTRAÇÃO (Top 10 > 60%)
            if (wealthConcentration > ALERT_CONFIG.WEALTH_CONCENTRATION_THRESHOLD) {
                alerts.push({
                    title: '🚨 ALERTA DE CONCENTRAÇÃO DE RIQUEZA',
                    desc: `O Top 10 usuários detém **${wealthConcentration.toFixed(2)}%** de toda a economia.\n` +
                          `Isso sufoca novos players e estagna o servidor.`
                });
                logEntries.push({
                    type: 'Concentracao',
                    value: `${wealthConcentration.toFixed(2)}%`,
                    limit: `${ALERT_CONFIG.WEALTH_CONCENTRATION_THRESHOLD}%`,
                    desc: 'Top 10 dominando economia'
                });
            }

            // 🚨 3. ALERTA DE EMPRÉSTIMO DE RISCO (Emprestado > X% da Economia)
            if (totalEconomy > 0) {
                const loanRiskPercent = (totalLoanedValue / totalEconomy) * 100;
                if (loanRiskPercent > ALERT_CONFIG.LOAN_RISK_THRESHOLD_PERCENT) {
                    alerts.push({
                        title: '🚨 ALERTA DE RISCO BANCÁRIO',
                        desc: `O valor total emprestado (${totalLoanedValue.toFixed(2)}) representa **${loanRiskPercent.toFixed(2)}%** da economia.\n` +
                              `O banco está segurando a economia artificialmente. Risco de crash!`
                    });
                    logEntries.push({
                        type: 'RiscoBancario',
                        value: `${loanRiskPercent.toFixed(2)}%`,
                        limit: `${ALERT_CONFIG.LOAN_RISK_THRESHOLD_PERCENT}%`,
                        desc: 'Volume de emprestimos critico'
                    });
                }
            }

            // Enviar Alertas (DM)
            if (alerts.length > 0) {
                const alertEmbed = new EmbedBuilder()
                    .setTitle('⚠️ RELATÓRIO DE RISCO ECONÔMICO')
                    .setColor('#FF0000')
                    .setDescription(`Foram detectadas **${alerts.length}** anomalias na economia de hoje (${todayISO}).`)
                    .setTimestamp();

                alerts.forEach(alert => {
                    alertEmbed.addFields({ name: alert.title, value: alert.desc });
                });

                // Tentar enviar para o Dono
                const OWNER_ID = process.env.OWNER_ID;
                if (OWNER_ID) {
                    try {
                        const owner = await client.users.fetch(OWNER_ID);
                        if (owner) await owner.send({ embeds: [alertEmbed] });
                    } catch (err) {
                        console.error('❌ [EXPORT] Falha ao enviar alerta para Owner:', err);
                    }
                } else {
                    console.warn('⚠️ [EXPORT] OWNER_ID não configurado. Alertas não enviados.');
                }
            }

            // Salvar Log de Incidentes (CSV)
            if (logEntries.length > 0) {
                try {
                    const logHeader = 'timestamp,tipo,valor,limite,descricao,snapshot_date\n';
                    let shouldWriteHeader = false;
                    
                    if (!fs.existsSync(ALERTS_LOG_FILE)) {
                        shouldWriteHeader = true;
                    } else {
                        // Verificar se o header é o novo
                        const content = fs.readFileSync(ALERTS_LOG_FILE, 'utf8');
                        const lines = content.split('\n');
                        const firstLine = lines[0].trim();
                        if (!firstLine.includes('snapshot_date')) {
                            // Header antigo detectado: Renomear e criar novo
                            const backupName = path.join(EXPORT_DIR, `alerts-log-backup-${Date.now()}.csv`);
                            fs.renameSync(ALERTS_LOG_FILE, backupName);
                            shouldWriteHeader = true;
                        }
                    }

                    if (shouldWriteHeader) {
                        fs.writeFileSync(ALERTS_LOG_FILE, logHeader, 'utf8');
                    }

                    // Formato ISO: YYYY-MM-DD HH:mm:ss
                    // todayISO já é YYYY-MM-DD
                    const timeString = now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
                    const isoTimestamp = `${todayISO} ${timeString}`;
                    
                    const csvRows = logEntries.map(entry => {
                        return `${isoTimestamp},${entry.type},"${entry.value}","${entry.limit}","${entry.desc}",${todayISO}`;
                    }).join('\n');

                    fs.appendFileSync(ALERTS_LOG_FILE, csvRows + '\n', 'utf8');
                    console.log(`📝 [EXPORT] ${logEntries.length} alertas salvos em ${ALERTS_LOG_FILE}`);

                } catch (err) {
                    console.error('❌ [EXPORT] Falha ao salvar log de alertas:', err);
                }
            }
        }

        console.log(`✅ [EXPORT] Métricas exportadas com sucesso para ${todayISO}`);
        return { success: true, message: `Exportação concluída! Arquivo: ${EXPORT_FILE}` };

    } catch (error) {
        console.error('❌ [EXPORT] Erro fatal:', error);
        return { success: false, message: `Erro: ${error.message}` };
    }
}

module.exports = { runDailyExport };
