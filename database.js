const mongoose = require('mongoose');
require('dotenv').config();

const mongoURI = process.env.MONGODB_URI;

if (!mongoURI || mongoURI.includes('<db_password>')) {
    console.warn('⚠️ MONGODB_URI não configurada corretamente no .env (Senha ainda é o placeholder).');
} else {
    mongoose.connect(mongoURI, {
        serverSelectionTimeoutMS: 30000, // Aumentado para 30s para evitar timeouts em conexões lentas
        socketTimeoutMS: 45000,
        connectTimeoutMS: 30000, // Timeout para conexão inicial
        family: 4, // Força IPv4 para evitar problemas de rede em alguns containers
        maxPoolSize: 10, // Limita conexões para reduzir uso de memória
        minPoolSize: 2,
        maxIdleTimeMS: 30000 // Fecha conexões ociosas rapidamente
    })
    .then(() => {
        console.log('🍃 [DATABASE] Conexão estabelecida com MongoDB Atlas!');
        console.log('📡 [DATABASE] Status: PRONTO');
    })
    .catch(err => {
        console.error('❌ [DATABASE] Erro crítico na conexão!');
        if (err.message.includes('IP address is not whitelisted')) {
            console.error('🚨 [DATABASE] MOTIVO: IP da hospedagem bloqueado! Adicione 0.0.0.0/0 no Network Access do Atlas.');
        } else if (err.message.includes('authentication failed')) {
            console.error('🚨 [DATABASE] MOTIVO: Usuário ou senha incorretos no .env.');
        } else {
            console.error('🚨 [DATABASE] DETALHES:', err.message);
        }
    });
}

// Monitor de eventos de conexão
mongoose.connection.on('disconnected', () => console.log('🔌 [DATABASE] MongoDB desconectado.'));
mongoose.connection.on('reconnected', () => console.log('♻️ [DATABASE] MongoDB reconectado!'));
mongoose.connection.on('error', (err) => console.error('⚠️ [DATABASE] Erro na conexão ativa:', err.message));

// --- SCHEMAS ---

const UserSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    wallet: { type: Number, default: 0 },
    bank: { type: Number, default: 0 },
    inventory: { type: Map, of: Number, default: {} },
    lastWork: { type: Number, default: 0 },
    lastDaily: { type: Number, default: 0 },
    dailyStreak: { type: Number, default: 0 },
    lastRob: { type: Number, default: 0 },
    lastSlots: { type: Number, default: 0 },
    lastCoinflip: { type: Number, default: 0 },
    lastPPT: { type: Number, default: 0 },
    lastPenaltyTime: { type: Number, default: 0 },
    extraWorkCooldown: { type: Number, default: 0 },
    lastTransferDate: { type: String, default: "" }, // Formato YYYY-MM-DD
    dailyTransferTotal: { type: Number, default: 0 },
    dailyTransferCount: { type: Number, default: 0 }, // Número de transferências hoje
    jobId: { type: String, default: "desempregado" },
    totalWorks: { type: Number, default: 0 },
    // Novos campos para sistema de roubo
    robFailStreak: { type: Number, default: 0 },
    consecutiveRobFailures: { type: Number, default: 0 }, // New field for consecutive failures
    lastRobFail: { type: Number, default: 0 },
    workPenalty: { type: Number, default: 0 }, // Em minutos
    suspiciousUntil: { type: Number, default: 0 },
    wantedUntil: { type: Number, default: 0 },
    robBuffUntil: { type: Number, default: 0 },
    robDefenseUntil: { type: Number, default: 0 }, // 24h Protection
    workMultiplier: { type: Number, default: 1 }, // 1.5x for Investment Book
    immuneSuspiciousUntil: { type: Number, default: 0 }, // Hunting License
    lastBankRob: { type: Number, default: 0 },
    robLossReductionUntil: { type: Number, default: 0 }, // 50% less loss on rob fail
    bankProtectionUntil: { type: Number, default: 0 }, // Protects bank freeze
    jailReductionUntil: { type: Number, default: 0 }, // 50% less work penalty on crime fail
    shopDailyLimits: { type: Map, of: Number, default: {} }, // Tracks daily purchases per item
    lastShopReset: { type: Number, default: 0 }, // Timestamp of last daily limit reset
    gamblingLossStreak: { type: Number, default: 0 }, // Tracks consecutive gambling losses
    activePetId: { type: String, default: null }, // ID do pet equipado atualmente
    purchaseHistory: { type: Array, default: [] }, // Histórico das últimas compras: [{ item: String, price: Number, date: Number }]
    // Novos campos para itens da loja reformulada
    xpBuffExpires: { type: Number, default: 0 },
    xpBuffMultiplier: { type: Number, default: 1 },
    luckBuffExpires: { type: Number, default: 0 },
    luckBuffValue: { type: Number, default: 0 },
    workMultiplierExpires: { type: Number, default: 0 },
    nextDepositUnlimited: { type: Boolean, default: false },
    jobProtection: { type: Boolean, default: false },
    itemDropBuffExpires: { type: Number, default: 0 },
    stealthBuffExpires: { type: Number, default: 0 },
    hasPortableTerminal: { type: Boolean, default: false },
    alarmClockEnabled: { type: Boolean, default: false },
    alarmClockChannelId: { type: String, default: null },
    alarmClockGuildId: { type: String, default: null },
    alarmClockActivatedAt: { type: Number, default: 0 },
    playTime: { type: Number, default: 0 },
    workBuffStacks: { type: Number, default: 0 },
    incubating: { type: Array, default: [] }, // [{ id: String, type: String, startTime: Number, endTime: Number }]
    starterEggClaimed: { type: Boolean, default: false },
    dailyMissions: {
        date: { type: String, default: "" }, // YYYY-MM-DD
        tasks: { type: Array, default: [] } // [{ id, description, type, goal, progress, completed, rewardType, rewardValue }]
    },
    honor: { type: Number, default: 0 }, // Vitórias em amistosos
    lotteryWins: { type: Number, default: 0 }, // Vitórias na loteria
    pendingLotteryShout: { type: Boolean, default: false }, // Direito a uma mensagem global
    clanId: { type: String, default: null }, // ID do clã
    clanRole: { type: String, default: 'none' }, // 'leader', 'captain', 'member'
    clanJoinedAt: { type: Date, default: null }, // Data de entrada no clã
    lastEconomyActivity: { type: Number, default: () => Date.now() }, // Rastreamento de inatividade (Timestamp)
    inactivityWarningSent: { type: Boolean, default: false }, // Se o aviso de inatividade já foi enviado
    dailyBattles: {
        date: { type: String, default: "" }, // YYYY-MM-DD
        count: { type: Number, default: 0 }
    },
    // --- SISTEMA DE EMPRÉSTIMO ---
    loan: {
        active: { type: Boolean, default: false }, // Se tem dívida ativa
        id: { type: String, default: null }, // ID da dívida (UUID)
        lenderId: { type: String, default: null }, // ID do agiota
        borrowerId: { type: String, default: null }, // ID do devedor
        amount: { type: Number, default: 0 }, // Valor original
        totalToPay: { type: Number, default: 0 }, // Valor total com juros
        amountPaid: { type: Number, default: 0 }, // Quanto já pagou
        deadline: { type: Number, default: 0 }, // Timestamp de vencimento
        interestRate: { type: Number, default: 0 }, // Porcentagem
        status: { type: String, default: 'none' }, // pending, active, paid, overdue
        lastInterestDate: { type: String, default: "" }, // Data da última cobrança de juros (YYYY-MM-DD)
        installments: { type: Number, default: 0 }, // Número de parcelas
        installmentsPaid: { type: Number, default: 0 } // Parcelas pagas
    },
    creditScore: { type: Number, default: 500 }, // Score de crédito (0-1000)
    loanHistory: { type: Array, default: [] }, // [{ id, role, amount, status, date }]
    loanRequestsToday: {
        date: { type: String, default: "" }, // YYYY-MM-DD
        count: { type: Number, default: 0 }
    },

    // --- CRIME SYSTEM ---
    wantedLevel: { type: Number, default: 0 }, // 0 a 5
    crimeXp: { type: Number, default: 0 },
    darkWebInventory: { type: Map, of: Number, default: {} }, // Itens consumíveis: { "crowbar": 2, "mask": 1 }
    
    dailyGambles: { type: Number, default: 0 },
    lastGambleDate: { type: String, default: "" }, // YYYY-MM-DD
    
    // Voice System
    dailyVoiceTime: { type: Number, default: 0 }, // Minutes in voice today
    lastVoiceDate: { type: String, default: "" }, // YYYY-MM-DD
    totalVoiceTime: { type: Number, default: 0 }, // Total lifetime minutes
    voiceEarningsToday: { type: Number, default: 0 }, // Earnings from voice today

    hideFromRank: { type: Boolean, default: false }, // Admin: Esconde do ranking global/local
    blacklisted: { type: Boolean, default: false }, // Bloqueio total do bot
    godmodeBackup: { 
        wallet: { type: Number, default: 0 },
        bank: { type: Number, default: 0 }
        // Não salvamos inventário pois o godmode só afeta dinheiro. Se comprar itens, eles ficam.
        // O usuário disse "itens comprados com o dinheiro infinito devem desaparecer".
        // Isso é complexo. Teríamos que rastrear quais itens foram comprados durante o godmode.
        // Ou fazemos backup do inventário e restauramos o inventário antigo, perdendo TUDO que foi ganho (inclusive itens legítimos se houver mistura).
        // Como é godmode de teste, restaurar o estado ANTERIOR completo (snapshot) é o mais seguro e atende "itens comprados... devem desaparecer".
        , inventory: { type: Map, of: Number, default: {} }
    }
});

const PetSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true }, // ID único (UUID)
    userId: { type: String, required: true },
    petId: { type: String, required: true }, // ID do tipo (ex: 'cao_guarda')
    name: { type: String, required: true },
    rarity: { type: String, required: true },
    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    energy: { type: Number, default: 100 }, // 0-100
    fun: { type: Number, default: 100 }, // 0-100
    createdAt: { type: Number, default: Date.now },
    lastInteraction: { type: Number, default: Date.now },
    timesFed: { type: Number, default: 0 },
    timesPlayed: { type: Number, default: 0 },
    battlesWon: { type: Number, default: 0 }
});

const GuildConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    economy: { type: Object, default: {} },
    welcomeChannel: { type: String, default: null },
    welcomeMessage: { type: String, default: null },
    leaveChannel: { type: String, default: null },
    leaveMessage: { type: String, default: null },
    logsChannel: { type: String, default: null },
    // robLogChannel: { type: String, default: null }, // Deprecated: Replaced by dynamic economyLogChannel
    economyLogChannel: { type: String, default: null }, // Dynamic channel for economy logs
    lastCommandChannelId: { type: String, default: null }, // Último canal onde um comando foi usado
    lastEconomyActivity: { type: Number, default: 0 }, // Timestamp of last economy command
    lastBankRob: { type: Number, default: 0 }, // Cooldown global do servidor para assalto ao banco
    
    // Sistema de Entrada e Saída de Membros (Enhanced)
    welcome: {
        enabled: { type: Boolean, default: false },
        useEmbed: { type: Boolean, default: true },
        channelId: { type: String, default: null },
        title: { type: String, default: 'Bem-vindo!' },
        message: { type: String, default: 'Olá ${user}, seja bem-vindo ao ${guild.name}!' },
        footer: { type: String, default: null },
        imageUrl: { type: String, default: null },
        thumbnailUrl: { type: String, default: null },
        color: { type: String, default: '#2ECC71' },
        buttons: { type: Array, default: [] }, // [{ name: 'Nome', url: 'https://...' }]
        notifyMember: { type: Boolean, default: false },
        notifyRoleId: { type: String, default: null }
    },
    leave: {
        enabled: { type: Boolean, default: false },
        useEmbed: { type: Boolean, default: true },
        channelId: { type: String, default: null },
        title: { type: String, default: 'Adeus!' },
        message: { type: String, default: '${user.name} saiu do servidor.' },
        footer: { type: String, default: null },
        imageUrl: { type: String, default: null },
        thumbnailUrl: { type: String, default: null },
        color: { type: String, default: '#E74C3C' },
        buttons: { type: Array, default: [] },
        notifyRoleId: { type: String, default: null }
    },
    // Sistema de Parcerias
    partners: {
        channelId: { type: String, default: null },
        managerRoleId: { type: String, default: null }, // Cargo responsável por aceitar/postar
        pingRoleId: { type: String, default: null }, // Cargo marcado na postagem
        partnerRoleId: { type: String, default: null }, // Cargo dado ao representante
        dmEnabled: { type: Boolean, default: true }, // Enviar DM ao representante
        
        // Mensagem Pública
        publicMessage: {
            title: { type: String, default: '🤝 Nova parceria registrada!' },
            description: { type: String, default: 'Uma nova parceria foi realizada.\n\n👤 Representante: ${rep}\n📣 Promovida por: ${promoter}\n🌍 Servidor parceiro: ${guild}\n\nSeja bem-vindo e sucesso para as comunidades!' },
            footer: { type: String, default: 'Sistema de parcerias' },
            color: { type: String, default: null }, // Null usa cor do bot ou padrão
            image: { type: String, default: null },
            thumbnail: { type: String, default: null }
        },
        
        // DM do Representante
        dmMessage: {
            title: { type: String, default: '🤝 Parceria confirmada!' },
            description: { type: String, default: 'Olá ${rep}!\n\nUma parceria foi registrada envolvendo o servidor ${guild}.\n\nVocê foi definido como representante dessa parceria.\nSe precisar de algo, procure quem realizou a parceria no servidor.\n\nDesejamos sucesso para ambas as comunidades!' },
            footer: { type: String, default: 'Sistema automático de parcerias' },
            color: { type: String, default: null },
            image: { type: String, default: null },
            thumbnail: { type: String, default: null },
            buttons: { type: Array, default: [] } // [{ label: 'Nome', url: 'https://...' }]
        },
        
        // Regras
        rules: {
            removeOnLeave: { type: Boolean, default: false },
            requireInvite: { type: Boolean, default: true },
            dailyLimit: { type: Number, default: 0 }, // 0 = sem limite
            allowRepeatedGuild: { type: Boolean, default: false }
        },
        
        notifyExpiredInvite: { type: Boolean, default: false } // Notificar DM se convite expirar
    }
});

const GlobalConfigSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true }
});

const CustomEmbedSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    titulo: { type: String, required: true },
    descricao: { type: String, required: true },
    cor: { type: String, default: null },
    footer: { type: String, default: null },
    image: { type: String, default: null },
    timestamp: { type: String, default: null }
});

const ClanSchema = new mongoose.Schema({
    name: { type: String, unique: true },
    tag: { type: String, unique: true }, // [TAG]
    leaderId: String,
    bank: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    honor: { type: Number, default: 0 }, // Rank
    members: [{ userId: String, role: String, joinedAt: Date }], // role: 'leader', 'captain', 'member'
    upgrades: {
        barracks: { type: Number, default: 1 }, // Limite de membros (Level * 5 + 5)
        defense: { type: Number, default: 1 }, // Defesa em guerra
        income: { type: Number, default: 1 }, // Multiplicador de ganhos (imposto)
        market: { type: Boolean, default: false } // Mercado Negro
    },
    warShieldUntil: { type: Date, default: null }, // Proteção pós-derrota
    createdAt: { type: Date, default: Date.now },
    description: { type: String, default: "Um novo clã surgiu." },
    logo: { type: String, default: null }, // URL da imagem
    taxRate: { type: Number, default: 5 }, // Imposto padrão 5%
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    lastWar: { type: Date, default: null } // Última guerra travada
});

// --- SCHEMAS PARA PERSISTÊNCIA DE JOGOS E DROPS ---

const ActiveGameSchema = new mongoose.Schema({
    messageId: { type: String, required: true, unique: true },
    hostId: { type: String, required: true },
    hostName: { type: String, required: true },
    guestId: { type: String, default: null },
    guestName: { type: String, default: null },
    bet: { type: Number, default: 0 },
    selectedGame: { type: String, default: 'random' },
    players: { type: Array, default: [] },
    status: { type: String, default: 'LOBBY' }, // LOBBY, PLAYING, ENDED
    gameType: { type: String, default: null },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    turn: { type: String, default: null },
    difficulty: { type: String, default: 'medium' },
    originalSelection: { type: String, default: 'random' },
    rematchCount: { type: Number, default: 0 },
    createdAt: { type: Number, default: Date.now },
    expiresAt: { type: Number, required: true } // Para limpeza automática
});

const ActiveDropSchema = new mongoose.Schema({
    messageId: { type: String, required: true, unique: true },
    channelId: { type: String, required: true },
    guildId: { type: String, required: true },
    ownerId: { type: String, required: true },
    ownerName: { type: String, required: true },
    amount: { type: Number, required: true },
    maxWinners: { type: Number, required: true },
    participants: { type: Array, default: [] }, // Array de userIds
    endTime: { type: Number, required: true },
    createdAt: { type: Number, default: Date.now }
});

const ActiveGlobalDropSchema = new mongoose.Schema({
    globalDropId: { type: String, required: true, unique: true },
    ownerId: { type: String, required: true },
    ownerName: { type: String, required: true },
    amount: { type: Number, required: true },
    maxWinners: { type: Number, required: true },
    participants: { type: Array, default: [] }, // Array de userIds
    endTime: { type: Number, required: true },
    durationStr: { type: String, default: '' },
    sentMessages: { type: Array, default: [] }, // Array de {messageId, channelId, guildId}
    createdAt: { type: Number, default: Date.now }
});

// --- MODELS ---
// --- MODELS ---
// Robust model definition to prevent OverwriteModelError
let User;
try {
    User = mongoose.model('User');
} catch (error) {
    User = mongoose.model('User', UserSchema);
}

let Pet;
try {
    Pet = mongoose.model('Pet');
} catch (error) {
    Pet = mongoose.model('Pet', PetSchema);
}

let GuildConfig;
try {
    GuildConfig = mongoose.model('GuildConfig');
} catch (error) {
    GuildConfig = mongoose.model('GuildConfig', GuildConfigSchema);
}

let GlobalConfig;
try {
    GlobalConfig = mongoose.model('GlobalConfig');
} catch (error) {
    GlobalConfig = mongoose.model('GlobalConfig', GlobalConfigSchema);
}

let CustomEmbed;
try {
    CustomEmbed = mongoose.model('CustomEmbed');
} catch (error) {
    CustomEmbed = mongoose.model('CustomEmbed', CustomEmbedSchema);
}

let Clan;
try {
    Clan = mongoose.model('Clan');
} catch (error) {
    Clan = mongoose.model('Clan', ClanSchema);
}

let ActiveGame;
try {
    ActiveGame = mongoose.model('ActiveGame');
} catch (error) {
    ActiveGame = mongoose.model('ActiveGame', ActiveGameSchema);
}

let ActiveDrop;
try {
    ActiveDrop = mongoose.model('ActiveDrop');
} catch (error) {
    ActiveDrop = mongoose.model('ActiveDrop', ActiveDropSchema);
}

let ActiveGlobalDrop;
try {
    ActiveGlobalDrop = mongoose.model('ActiveGlobalDrop');
} catch (error) {
    ActiveGlobalDrop = mongoose.model('ActiveGlobalDrop', ActiveGlobalDropSchema);
}

// --- MÉTODOS ---

module.exports = {
    User,
    Pet,
    GuildConfig,
    GlobalConfig,
    CustomEmbed,
    Clan,

    // Usuários
    async getUser(userId) {
        let user = await User.findOne({ userId });
        if (!user) {
            user = await User.create({ userId });
        }
        return user;
    },

    async updateUser(userId, data) {
        // Atualiza timestamp de atividade se houver mudança financeira ou comando relevante
        if (data.wallet !== undefined || data.bank !== undefined || data.lastDaily || data.lastWork || data.lastRob) {
            data.lastEconomyActivity = Date.now();
            data.inactivityWarningSent = false; // Reseta o aviso se o usuário voltou a ser ativo
        }
        return await User.findOneAndUpdate({ userId }, { $set: data }, { upsert: true, returnDocument: 'after' });
    },

    async addMoney(userId, amount) {
        if (!amount || amount === 0) return;
        return await User.findOneAndUpdate(
            { userId },
            { 
                $inc: { wallet: amount },
                $set: { 
                    lastEconomyActivity: Date.now(),
                    inactivityWarningSent: false
                }
            },
            { upsert: true, returnDocument: 'after' }
        );
    },

    // --- COFRE GLOBAL ---
    // Métodos unificados para o cofre global (Loteria/Economia)
    async addToVault(amount, userId = null) {
        if (amount === 0) return; // Permite negativos para saque
        
        // Se userId for fornecido, verifica se está em God Mode
        if (userId) {
            const user = await this.getUser(userId);
            if (user && user.hideFromRank && user.wallet > 900000000) {
                // God Mode detectado: não adiciona ao cofre
                return;
            }
        }

        // Tenta incrementar atomicamente. Se falhar (documento não existe ou formato errado), recria.
        try {
            const result = await GlobalConfig.findOneAndUpdate(
                { key: 'global_vault' },
                { $inc: { value: amount } }, // Assumindo que value é um número direto
                { returnDocument: 'after' }
            );
            if (!result) {
                // Se não existir, cria
                await GlobalConfig.create({ key: 'global_vault', value: amount > 0 ? amount : 0 });
            }
        } catch (e) {
            // Fallback se o value não for numérico (migração de estrutura antiga se necessário)
            const current = await this.getVault();
            await GlobalConfig.findOneAndUpdate(
                { key: 'global_vault' },
                { value: Number(current) + Number(amount) },
                { upsert: true }
            );
        }
    },

    async getVault() {
        const config = await GlobalConfig.findOne({ key: 'global_vault' });
        // Suporta tanto número direto quanto objeto legado { balance: ... } se existir
        if (!config) return 0;
        if (typeof config.value === 'number') return config.value;
        if (config.value && config.value.balance) return config.value.balance;
        return 0;
    },

    // Remove do cofre (apenas um alias para add negativo)
    async removeFromVault(amount) {
        if (amount <= 0) return;
        const current = await this.getVault();
        if (current < amount) return false; // Sem fundos
        await this.addToVault(-amount);
        return true;
    },

    // --- PETS ---
    async createPet(userId, petData) {
        return await Pet.create({
            id: petData.id, // UUID
            userId: userId,
            petId: petData.petId, // tipo
            name: petData.name,
            rarity: petData.rarity,
            level: 1,
            xp: 0,
            energy: 100,
            fun: 100
        });
    },

    async getPet(petUUID) {
        return await Pet.findOne({ id: petUUID });
    },

    async getUserPets(userId) {
        return await Pet.find({ userId });
    },

    async getActivePet(userId) {
        const user = await this.getUser(userId);
        if (!user.activePetId) return null;
        return await Pet.findOne({ id: user.activePetId });
    },

    async deletePet(petUUID) {
        return await Pet.deleteOne({ id: petUUID });
    },

    async updatePet(petUUID, data) {
        return await Pet.findOneAndUpdate({ id: petUUID }, { $set: data }, { returnDocument: 'after' });
    },

    async getActivePet(userId) {
        const user = await this.getUser(userId);
        if (!user.activePetId) return null;
        return await Pet.findOne({ id: user.activePetId });
    },

    async getGuildConfig(guildId) {
        let config = await GuildConfig.findOne({ guildId });
        if (!config) {
            config = await GuildConfig.create({ guildId });
        }
        return config;
    },

    async updateGuildConfig(guildId, data) {
        return await GuildConfig.findOneAndUpdate({ guildId }, { $set: data }, { upsert: true, returnDocument: 'after' });
    },

    // Configuração Global
    async saveGlobalConfig(key, value) {
        return await GlobalConfig.findOneAndUpdate({ key }, { value }, { upsert: true, returnDocument: 'after' });
    },

    async getGlobalConfig(key) {
        const config = await GlobalConfig.findOne({ key });
        return config ? config.value : null;
    },

    // Inventário
    async getInventory(userId) {
        const user = await this.getUser(userId);
        return Object.fromEntries(user.inventory || new Map());
    },

    async addItem(userId, itemId, amount = 1) {
        const user = await this.getUser(userId);
        const currentAmount = user.inventory.get(itemId) || 0;
        user.inventory.set(itemId, currentAmount + amount);
        return await user.save();
    },

    async removeItem(userId, itemId, amount) {
        const user = await this.getUser(userId);
        const currentAmount = user.inventory.get(itemId) || 0;
        const newAmount = Math.max(0, currentAmount - amount);
        
        if (newAmount === 0) {
            user.inventory.delete(itemId);
        } else {
            user.inventory.set(itemId, newAmount);
        }
        
        await user.save();
    },

    // Configurações de Guild
    async saveGuildConfig(guildId, configData) {
        return await GuildConfig.findOneAndUpdate({ guildId }, { $set: configData }, { upsert: true, new: true });
    },

    async getEconomyConfig(guildId) {
        const config = await this.getGuildConfig(guildId);
        return config.economy || {};
    },

    // Embeds Customizados
    async getCustomEmbeds(userId) {
        return await CustomEmbed.find({ userId });
    },

    async saveCustomEmbed(embedData) {
        return await CustomEmbed.findOneAndUpdate({ id: embedData.id }, embedData, { upsert: true, returnDocument: 'after' });
    },

    async deleteCustomEmbed(embedId) {
        return await CustomEmbed.deleteOne({ id: embedId });
    },

    // Rotação da Loja
    async getShopRotation() {
        return await this.getGlobalConfig('shop_rotation');
    },

    async setShopRotation(rotationData) {
        return await this.saveGlobalConfig('shop_rotation', rotationData);
    },

    // Loteria
    async addLotteryParticipant(userId, guildId = null) {
        const participants = await this.getGlobalConfig('lottery_participants') || [];
        // Armazena objeto { userId, guildId } para rastreamento
        participants.push({ userId, guildId });
        await this.saveGlobalConfig('lottery_participants', participants);
        return true;
    },

    async getLotteryParticipants() {
        return await this.getGlobalConfig('lottery_participants') || [];
    },

    async clearLotteryParticipants() {
        return await this.saveGlobalConfig('lottery_participants', []);
    },

    async getLotteryDrawTime() {
        return await this.getGlobalConfig('lottery_next_draw') || 0;
    },

    async setLotteryDrawTime(timestamp) {
        return await this.saveGlobalConfig('lottery_next_draw', timestamp);
    },

    // Método para atualizar o último canal usado em comandos de economia
    async updateLastEconomyChannel(guildId, channelId) {
        try {
            await GuildConfig.findOneAndUpdate(
                { guildId },
                { 
                    lastCommandChannelId: channelId,
                    lastEconomyActivity: Date.now()
                },
                { upsert: true, new: true }
            );
        } catch (err) {
            console.error(`Erro ao atualizar último canal de economia para guild ${guildId}:`, err);
        }
    },

    // Estatísticas Globais
    async incrementGlobalCommandCount() {
        try {
            await GlobalConfig.findOneAndUpdate(
                { key: 'total_commands_used' },
                { $inc: { value: 1 } },
                { upsert: true }
            );
        } catch (err) {
            console.error('Erro ao incrementar contador global de comandos:', err);
        }
    },

    async getGlobalCommandCount() {
        const config = await GlobalConfig.findOne({ key: 'total_commands_used' });
        return config ? config.value : 0;
    },

    // Função helper para aplicar taxa de guilda
    async applyGuildTax(userId, amount) {
        const user = await this.getUser(userId);
        if (!user.clanId) return { finalAmount: amount, tax: 0, guildTag: null };
        
        const clan = await this.Clan.findById(user.clanId);
        if (!clan || !clan.taxRate || clan.taxRate <= 0) {
            return { finalAmount: amount, tax: 0, guildTag: null };
        }
        
        const tax = Math.floor(amount * (clan.taxRate / 100));
        const finalAmount = amount - tax;
        
        // Verificar se o usuário é o líder da guilda
        const isLeader = clan.leaderId === userId;
        
        if (isLeader) {
            // Se for o líder, a taxa vai para o cofre da guilda
            await this.Clan.findByIdAndUpdate(clan._id, { 
                $inc: { bank: tax }
            });
            
            return {
                finalAmount,
                tax,
                guildTag: clan.tag,
                taxRate: clan.taxRate,
                taxDestination: 'guild'
            };
        } else {
            // Se não for o líder, a taxa vai para o cofre global
            await this.addToVault(tax, userId);
            
            return {
                finalAmount,
                tax,
                guildTag: clan.tag,
                taxRate: clan.taxRate,
                taxDestination: 'global'
            };
        }
    }
};
