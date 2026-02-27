const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, UserSelectMenuBuilder, ComponentType } = require('discord.js');
const db = require('../../database');
const colors = require('../../colors.json');
const petBattleSystem = require('../../systems/petBattleSystem');

// Configurações
const CLAN_CREATE_COST = 50000;
const CLAN_CREATE_COST_FORMATTED = "50.000";
const CLAN_TAG_REGEX = /^[A-Z0-9]{3,4}$/;
const CLAN_NAME_REGEX = /^[A-Za-z0-9 ]{3,20}$/;

const UPGRADE_COSTS = {
    barracks: (level) => level * 100000,
    defense: (level) => level * 150000,
    income: (level) => level * 200000
};

const MAX_MEMBERS = (level) => 10 + ((level - 1) * 5);

const WAR_COST = 100000;
const WAR_COST_FORMATTED = "100.000";
const WAR_COOLDOWN_HOURS = 24;
const SHIELD_DURATION_HOURS = 24;
const STEAL_PERCENTAGE = 0.10;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('guilda')
        .setDescription('🏰 Acesse o painel da sua Guilda'),

    async execute(interaction) {
        const user = await db.getUser(interaction.user.id);
        const payload = await getGuildPanel(interaction, user);
        return interaction.reply(payload);
    },

    // --- HANDLERS ---

    async handleButton(interaction) {
        const { customId } = interaction;
        const user = await db.getUser(interaction.user.id);

        // Atualizar Painel
        if (customId === 'guilda_btn_refresh') {
            const payload = await getGuildPanel(interaction, user);
            return interaction.update(payload);
        }

        // Criar Guilda (Modal)
        if (customId === 'guilda_btn_create') {
            const modal = new ModalBuilder()
                .setCustomId('guilda_modal_create')
                .setTitle('Fundar Nova Guilda');

            const nameInput = new TextInputBuilder()
                .setCustomId('guilda_name')
                .setLabel("Nome da Guilda")
                .setPlaceholder("Ex: Os Vingadores")
                .setStyle(TextInputStyle.Short)
                .setMinLength(3)
                .setMaxLength(20)
                .setRequired(true);

            const tagInput = new TextInputBuilder()
                .setCustomId('guilda_tag')
                .setLabel("TAG (Sigla)")
                .setPlaceholder("Ex: AVG (3-4 letras/números)")
                .setStyle(TextInputStyle.Short)
                .setMinLength(3)
                .setMaxLength(4)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(nameInput), new ActionRowBuilder().addComponents(tagInput));
            return interaction.showModal(modal);
        }

        // Ranking
        if (customId === 'guilda_btn_ranking') {
            return showRanking(interaction);
        }

        // --- CONVITES (优先 - antes de verificar se tem guilda) ---
        if (customId.startsWith('guilda_invite_accept_')) {
            const clanId = customId.replace('guilda_invite_accept_', '');
            return acceptInvite(interaction, user, clanId);
        }
        if (customId === 'guilda_invite_reject') {
            return interaction.update({ content: '❌ Convite recusado.', embeds: [], components: [] });
        }

        // --- AÇÕES DE MEMBRO/LÍDER ---
        if (!user.clanId) return interaction.reply({ content: '❌ Você não tem guilda.', ephemeral: true });
        const clan = await db.Clan.findById(user.clanId);
        if (!clan) return interaction.reply({ content: '❌ Erro: Guilda não encontrada.', ephemeral: true });

        // Depositar (Modal)
        if (customId === 'guilda_btn_deposit') {
            const modal = new ModalBuilder()
                .setCustomId('guilda_modal_deposit')
                .setTitle(`Depositar em [${clan.tag}]`);

            const valueInput = new TextInputBuilder()
                .setCustomId('guilda_deposit_value')
                .setLabel("Valor para depositar")
                .setPlaceholder("Ex: 1000")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(valueInput));
            return interaction.showModal(modal);
        }

        // Membros (Lista)
        if (customId === 'guilda_btn_members') {
            return showMembers(interaction, clan);
        }

        // Sair
        if (customId === 'guilda_btn_leave') {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('guilda_btn_leave_confirm').setLabel('CONFIRMAR SAÍDA').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('guilda_btn_cancel').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
            );
            return interaction.reply({ content: '⚠️ **Tem certeza que deseja sair da guilda?**', components: [row], ephemeral: true });
        }
        if (customId === 'guilda_btn_leave_confirm') {
            return leaveClan(interaction, user, clan);
        }
        if (customId === 'guilda_btn_cancel') {
            return interaction.update({ content: '❌ Operação cancelada.', components: [], embeds: [] });
        }

        // --- AÇÕES DE LÍDER/CAPITÃO ---
        const isLeader = user.clanRole === 'leader';
        const isCaptain = user.clanRole === 'captain';
        
        if (customId === 'guilda_btn_recruit') {
            if (!isLeader && !isCaptain) return interaction.reply({ content: '❌ Apenas Líder e Capitães podem recrutar.', ephemeral: true });
            
            const row = new ActionRowBuilder().addComponents(
                new UserSelectMenuBuilder().setCustomId('guilda_select_recruit').setPlaceholder('Selecione quem recrutar')
            );
            return interaction.reply({ content: '📩 **Quem você quer recrutar?**', components: [row], ephemeral: true });
        }

        if (customId === 'guilda_btn_expel') { // Botão novo, caso queiramos adicionar no menu de membros ou principal
            if (!isLeader && !isCaptain) return interaction.reply({ content: '❌ Apenas Líder e Capitães podem expulsar.', ephemeral: true });
            
            const row = new ActionRowBuilder().addComponents(
                new UserSelectMenuBuilder().setCustomId('guilda_select_expel').setPlaceholder('Selecione quem expulsar')
            );
            return interaction.reply({ content: '👢 **Quem você quer expulsar?**', components: [row], ephemeral: true });
        }

        if (customId === 'guilda_btn_upgrades') {
            return showUpgrades(interaction, user, clan);
        }

        if (['guilda_upgrade_barracks', 'guilda_upgrade_defense', 'guilda_upgrade_income'].includes(customId)) {
            return processUpgrade(interaction, user, clan, customId);
        }

// Guerra
        if (customId === 'guilda_btn_war') {
            if (!isLeader) return interaction.reply({ content: '❌ Apenas o Líder pode declarar guerra.', ephemeral: true });
            
            const modal = new ModalBuilder()
                .setCustomId('guilda_modal_war')
                .setTitle('Declarar Guerra');

            const tagInput = new TextInputBuilder()
                .setCustomId('guilda_war_tag')
                .setLabel("TAG da Guilda Inimiga")
                .setPlaceholder("Ex: FOX")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(tagInput));
            return interaction.showModal(modal);
        }

        if (customId === 'guilda_btn_war_confirm') {
            return interaction.reply({ content: '❌ Erro de fluxo. Tente novamente.', ephemeral: true });
        }
        
        if (customId.startsWith('guilda_btn_war_confirm_')) {
             const enemyTag = customId.replace('guilda_btn_war_confirm_', '');
             return executeWar(interaction, user, clan, enemyTag);
        }

        // Mudar Logo
        if (customId === 'guilda_btn_logo') {
            if (!isLeader) return interaction.reply({ content: '❌ Apenas o Líder pode mudar a foto da guilda.', ephemeral: true });
            
            const modal = new ModalBuilder()
                .setCustomId('guilda_modal_logo')
                .setTitle('🖼️ Mudar Foto da Guilda');

            const logoInput = new TextInputBuilder()
                .setCustomId('guilda_logo_url')
                .setLabel("URL da Imagem")
                .setPlaceholder("https://exemplo.com/imagem.png")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(500);

            modal.addComponents(new ActionRowBuilder().addComponents(logoInput));
            return interaction.showModal(modal);
        }

        // Configurar Taxa
        if (customId === 'guilda_btn_tax') {
            if (!isLeader) return interaction.reply({ content: '❌ Apenas o Líder pode configurar a taxa.', ephemeral: true });
            
            const modal = new ModalBuilder()
                .setCustomId('guilda_modal_tax')
                .setTitle('💸 Configurar Taxa da Guilda');

            const taxInput = new TextInputBuilder()
                .setCustomId('guilda_tax_rate')
                .setLabel("Taxa (%)")
                .setPlaceholder("Ex: 5 (para 5%)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(0)
                .setMaxLength(2);

            modal.addComponents(new ActionRowBuilder().addComponents(taxInput));
            return interaction.showModal(modal);
        }

        // Promover Membro
        if (customId === 'guilda_btn_promote') {
            if (!isLeader) return interaction.reply({ content: '❌ Apenas o Líder pode promover membros.', ephemeral: true });
            
            const row = new ActionRowBuilder().addComponents(
                new UserSelectMenuBuilder().setCustomId('guilda_select_promote').setPlaceholder('Selecione quem promover')
            );
            return interaction.reply({ content: '⬆️ **Quem você quer promover?**', components: [row], ephemeral: true });
        }
    },

    async handleModal(interaction) {
        const { customId } = interaction;
        const user = await db.getUser(interaction.user.id);

        if (customId === 'guilda_modal_create') {
            return createClan(interaction, user);
        }

        if (customId === 'guilda_modal_deposit') {
            return depositClan(interaction, user);
        }

if (customId === 'guilda_modal_war') {
            return prepareWar(interaction, user);
        }

        if (customId === 'guilda_modal_logo') {
            return updateClanLogo(interaction, user);
        }

        if (customId === 'guilda_modal_tax') {
            return updateClanTax(interaction, user);
        }
    },

async handleSelect(interaction) {
        const { customId, values } = interaction;
        const user = await db.getUser(interaction.user.id);
        
        if (customId === 'guilda_select_recruit') {
            return recruitMember(interaction, user, values[0]);
        }
        if (customId === 'guilda_select_expel') {
            return kickMember(interaction, user, values[0]);
        }
        if (customId === 'guilda_select_promote') {
            return promoteMember(interaction, user, values[0]);
        }
    }
};

// --- FUNÇÕES AUXILIARES ---

async function getGuildPanel(interaction, user) {
    if (!user.clanId) {
        const embed = new EmbedBuilder()
            .setTitle('🏰 Sistema de Guildas')
            .setDescription(`Você não faz parte de nenhuma guilda.\n\nCrie sua própria guilda para dominar o servidor ou entre em uma existente!`)
            .addFields(
                { name: '💰 Custo para Criar', value: `$${CLAN_CREATE_COST_FORMATTED}`, inline: true },
                { name: 'Benefícios', value: '• Bônus de status\n• Guerras de Clãs\n• Loja exclusiva\n• Comunidade', inline: true }
            )
            .setColor(colors.secondary || '#3498DB');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('guilda_btn_create').setLabel('Criar Guilda').setStyle(ButtonStyle.Success).setEmoji('🔨'),
            new ButtonBuilder().setCustomId('guilda_btn_ranking').setLabel('Ranking').setStyle(ButtonStyle.Primary).setEmoji('🏆')
        );

        return { embeds: [embed], components: [row] };
    }

    const clan = await db.Clan.findById(user.clanId);
    if (!clan) {
        // Correção de dados corrompidos
        user.clanId = null;
        user.clanRole = 'none';
        await user.save();
        return { content: '❌ Erro: Sua guilda não existe mais. Dados atualizados.', components: [] };
    }

    const leader = await interaction.client.users.fetch(clan.leaderId).catch(() => ({ username: 'Desconhecido' }));
    const maxMembers = MAX_MEMBERS(clan.upgrades.barracks);

    const embed = new EmbedBuilder()
        .setTitle(`🏰 [${clan.tag}] ${clan.name}`)
        .setDescription(clan.description || 'Sem descrição.')
        .addFields(
            { name: '👑 Líder', value: leader.username, inline: true },
            { name: '👥 Membros', value: `${clan.members.length}/${maxMembers}`, inline: true },
            { name: '🏆 Honra', value: `${clan.honor}`, inline: true },
            { name: '💰 Cofre', value: `$${clan.bank.toLocaleString()}`, inline: true },
            { name: '💸 Taxa', value: `${clan.taxRate || 0}%`, inline: true },
            { name: '⚔️ Guerras', value: `V: ${clan.wins} | D: ${clan.losses}`, inline: true },
            { name: '🛡️ Escudo', value: clan.warShieldUntil && new Date(clan.warShieldUntil) > new Date() ? `Ativo até <t:${Math.floor(new Date(clan.warShieldUntil).getTime()/1000)}:R>` : 'Inativo', inline: true },
            { name: '🏗️ Nível da Base', value: `Quartel: ${clan.upgrades.barracks} | Defesa: ${clan.upgrades.defense} | Renda: ${clan.upgrades.income}`, inline: false }
        )
        .setColor(colors.default || '#1B4D3E')
        .setThumbnail(clan.logo || interaction.guild.iconURL());

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('guilda_btn_deposit').setLabel('Depositar').setStyle(ButtonStyle.Success).setEmoji('💰'),
        new ButtonBuilder().setCustomId('guilda_btn_members').setLabel('Membros').setStyle(ButtonStyle.Secondary).setEmoji('👥'),
        new ButtonBuilder().setCustomId('guilda_btn_upgrades').setLabel('Upgrades').setStyle(ButtonStyle.Primary).setEmoji('🏗️')
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('guilda_btn_recruit').setLabel('Recrutar').setStyle(ButtonStyle.Secondary).setEmoji('📩').setDisabled(user.clanRole === 'member'),
        new ButtonBuilder().setCustomId('guilda_btn_expel').setLabel('Expulsar').setStyle(ButtonStyle.Secondary).setEmoji('👢').setDisabled(user.clanRole === 'member'),
        new ButtonBuilder().setCustomId('guilda_btn_leave').setLabel('Sair').setStyle(ButtonStyle.Danger).setEmoji('🚪')
    );

const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('guilda_btn_war').setLabel('GUERRA').setStyle(ButtonStyle.Danger).setEmoji('⚔️').setDisabled(user.clanRole !== 'leader'),
        new ButtonBuilder().setCustomId('guilda_btn_promote').setLabel('Promover').setStyle(ButtonStyle.Primary).setEmoji('⬆️').setDisabled(user.clanRole !== 'leader'),
        new ButtonBuilder().setCustomId('guilda_btn_logo').setLabel('🖼️ Foto').setStyle(ButtonStyle.Secondary).setDisabled(user.clanRole !== 'leader'),
        new ButtonBuilder().setCustomId('guilda_btn_tax').setLabel('Taxa').setStyle(ButtonStyle.Primary).setEmoji('💸').setDisabled(user.clanRole !== 'leader')
    );

    const row4 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('guilda_btn_refresh').setLabel('Atualizar').setStyle(ButtonStyle.Secondary).setEmoji('🔄')
    );

    return { embeds: [embed], components: [row1, row2, row3, row4] };
}

// --- LOGIC FUNCTIONS ---

async function createClan(interaction, user) {
    const nome = interaction.fields.getTextInputValue('guilda_name');
    const tag = interaction.fields.getTextInputValue('guilda_tag').toUpperCase();

    if (user.clanId) return interaction.reply({ content: '❌ Você já tem guilda.', ephemeral: true });
    if (user.wallet < CLAN_CREATE_COST) return interaction.reply({ content: `❌ Saldo insuficiente ($${CLAN_CREATE_COST_FORMATTED}).`, ephemeral: true });
    if (!CLAN_NAME_REGEX.test(nome)) return interaction.reply({ content: '❌ Nome inválido (3-20 chars).', ephemeral: true });
    if (!CLAN_TAG_REGEX.test(tag)) return interaction.reply({ content: '❌ TAG inválida (3-4 letras/números).', ephemeral: true });

    const existing = await db.Clan.findOne({ $or: [{ name: nome }, { tag: tag }] });
    if (existing) return interaction.reply({ content: '❌ Nome ou TAG já em uso.', ephemeral: true });

    user.wallet -= CLAN_CREATE_COST;
    const newClan = new db.Clan({
        name: nome, tag: tag, leaderId: user.userId,
        members: [{ userId: user.userId, role: 'leader', joinedAt: new Date() }]
    });

    await newClan.save();
    user.clanId = newClan._id;
    user.clanRole = 'leader';
    user.clanJoinedAt = new Date();
    await user.save();

    return interaction.reply({ content: `✅ Guilda **[${tag}] ${nome}** criada com sucesso!`, ephemeral: true });
}

async function depositClan(interaction, user) {
    if (!user.clanId) return interaction.reply({ content: '❌ Sem guilda.', ephemeral: true });
    
    const valueStr = interaction.fields.getTextInputValue('guilda_deposit_value');
    const amount = parseInt(valueStr);

    if (isNaN(amount) || amount <= 0) return interaction.reply({ content: '❌ Valor inválido.', ephemeral: true });
    if (user.wallet < amount) return interaction.reply({ content: '❌ Saldo insuficiente.', ephemeral: true });

    const clan = await db.Clan.findById(user.clanId);
    user.wallet -= amount;
    clan.bank += amount;
    
    await user.save();
    await clan.save();

    return interaction.reply({ content: `💰 Depositado **$${amount.toLocaleString()}** no cofre da guilda!`, ephemeral: true });
}

async function showMembers(interaction, clan) {
    const membersList = await Promise.all(clan.members.map(async m => {
        const u = await interaction.client.users.fetch(m.userId).catch(() => ({ username: 'Unknown' }));
        return `• ${m.role === 'leader' ? '👑' : m.role === 'captain' ? '⭐' : '👤'} **${u.username}**`;
    }));

    const embed = new EmbedBuilder()
        .setTitle(`👥 Membros de ${clan.tag}`)
        .setDescription(membersList.join('\n') || 'Nenhum membro encontrado.')
        .setColor(colors.default || '#1B4D3E');

    if (interaction.replied || interaction.deferred) {
        return interaction.followUp({ embeds: [embed], ephemeral: true });
    }
    return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function recruitMember(interaction, user, targetId) {
    if (!user.clanId) return;
    const clan = await db.Clan.findById(user.clanId);
    const targetUser = await db.getUser(targetId);
    const maxMembers = MAX_MEMBERS(clan.upgrades.barracks);

    if (targetUser.clanId) return interaction.reply({ content: '❌ Usuário já tem guilda.', ephemeral: true });
    if (clan.members.length >= maxMembers) return interaction.reply({ content: '❌ Guilda cheia.', ephemeral: true });

    const embed = new EmbedBuilder()
        .setTitle(`📜 Convite de Guilda`)
        .setDescription(`Você foi convidado para **[${clan.tag}] ${clan.name}**!\n\nAceitar?`)
        .setColor(colors.warning || '#F1C40F');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`guilda_invite_accept_${clan._id}`).setLabel('Aceitar').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('guilda_invite_reject').setLabel('Recusar').setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({ content: `📩 Convite enviado para <@${targetId}>.`, ephemeral: true });
    // Enviar mensagem para o canal atual mencionando o alvo
    return interaction.channel.send({ content: `<@${targetId}>`, embeds: [embed], components: [row] });
}

async function acceptInvite(interaction, user, clanId) {
    if (user.clanId) return interaction.update({ content: '❌ Você já tem guilda.', embeds: [], components: [] });
    
    const clan = await db.Clan.findById(clanId);
    if (!clan) return interaction.update({ content: '❌ Guilda não existe mais.', embeds: [], components: [] });
    
    const maxMembers = MAX_MEMBERS(clan.upgrades.barracks);
    if (clan.members.length >= maxMembers) return interaction.update({ content: '❌ Guilda lotou.', embeds: [], components: [] });

    clan.members.push({ userId: user.userId, role: 'member', joinedAt: new Date() });
    await clan.save();

    user.clanId = clan._id;
    user.clanRole = 'member';
    user.clanJoinedAt = new Date();
    await user.save();

    return interaction.update({ content: `🎉 **${interaction.user.username}** entrou na guilda **[${clan.tag}]**!`, embeds: [], components: [] });
}

async function kickMember(interaction, user, targetId) {
    if (user.userId === targetId) return interaction.reply({ content: '❌ Não pode se expulsar.', ephemeral: true });
    
    const targetDb = await db.getUser(targetId);
    if (targetDb.clanId !== user.clanId) return interaction.reply({ content: '❌ Usuário não é da sua guilda.', ephemeral: true });
    if (targetDb.clanRole === 'leader') return interaction.reply({ content: '❌ Não pode expulsar o líder.', ephemeral: true });
    if (user.clanRole === 'captain' && targetDb.clanRole === 'captain') return interaction.reply({ content: '❌ Capitão não expulsa Capitão.', ephemeral: true });

    const clan = await db.Clan.findById(user.clanId);
    clan.members = clan.members.filter(m => m.userId !== targetId);
    await clan.save();

    targetDb.clanId = null;
    targetDb.clanRole = 'none';
    await targetDb.save();

    return interaction.reply({ content: `👢 Membro expulso com sucesso.`, ephemeral: true });
}

async function leaveClan(interaction, user, clan) {
    if (user.clanRole === 'leader') return interaction.update({ content: '❌ Líder não pode sair. Transfira a liderança ou peça ao admin para deletar.', components: [] });

    clan.members = clan.members.filter(m => m.userId !== user.userId);
    await clan.save();

    user.clanId = null;
    user.clanRole = 'none';
    await user.save();

    return interaction.update({ content: `👋 Você saiu da guilda **[${clan.tag}]**.`, components: [] });
}

async function showUpgrades(interaction, user, clan) {
    if (!['leader', 'captain'].includes(user.clanRole)) return interaction.reply({ content: '❌ Apenas staff da guilda.', ephemeral: true });

    const costBarracks = UPGRADE_COSTS.barracks(clan.upgrades.barracks);
    const costDefense = UPGRADE_COSTS.defense(clan.upgrades.defense);
    const costIncome = UPGRADE_COSTS.income(clan.upgrades.income);

    const embed = new EmbedBuilder()
        .setTitle(`🏗️ Upgrades: [${clan.tag}]`)
        .setDescription(`Cofre: **$${clan.bank.toLocaleString()}**`)
        .addFields(
            { name: `⛺ Quartel (Nv ${clan.upgrades.barracks})`, value: `Vagas: ${MAX_MEMBERS(clan.upgrades.barracks)}\nCusto: $${costBarracks.toLocaleString()}`, inline: true },
            { name: `🛡️ Muralha (Nv ${clan.upgrades.defense})`, value: `Defesa +5%\nCusto: $${costDefense.toLocaleString()}`, inline: true },
            { name: `💰 Mercado (Nv ${clan.upgrades.income})`, value: `Renda +Base\nCusto: $${costIncome.toLocaleString()}`, inline: true }
        )
        .setColor(colors.primary || '#2ECC71');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('guilda_upgrade_barracks').setLabel('Upar Quartel').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('guilda_upgrade_defense').setLabel('Upar Muralha').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('guilda_upgrade_income').setLabel('Upar Mercado').setStyle(ButtonStyle.Primary)
    );

    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

async function processUpgrade(interaction, user, clan, type) {
    const upgradeMap = {
        'guilda_upgrade_barracks': { key: 'barracks', name: 'Quartel' },
        'guilda_upgrade_defense': { key: 'defense', name: 'Muralha' },
        'guilda_upgrade_income': { key: 'income', name: 'Mercado' }
    };
    
    const up = upgradeMap[type];
    const cost = UPGRADE_COSTS[up.key](clan.upgrades[up.key]);

    // Refetch para garantir saldo atualizado
    const freshClan = await db.Clan.findById(clan._id);
    
    if (freshClan.bank < cost) return interaction.update({ content: `❌ Saldo insuficiente no cofre. Precisa de $${cost.toLocaleString()}.`, embeds: [], components: [] });

    freshClan.bank -= cost;
    freshClan.upgrades[up.key]++;
    await freshClan.save();

    return interaction.update({ content: `✅ **Upgrade Realizado!** ${up.name} nível ${freshClan.upgrades[up.key]}.`, embeds: [], components: [] });
}

async function showRanking(interaction) {
    const clans = await db.Clan.find().sort({ honor: -1 }).limit(10);
    const embed = new EmbedBuilder()
        .setTitle('🏆 Ranking de Guildas')
        .setDescription(clans.map((c, i) => `${i+1}º **[${c.tag}] ${c.name}** - 🎖️ ${c.honor}`).join('\n') || 'Nenhuma guilda.')
        .setColor(colors.gold || '#FFD700');
    
    return interaction.reply({ embeds: [embed], ephemeral: true });
}

// --- WAR SYSTEM ---

async function prepareWar(interaction, user) {
    const enemyTag = interaction.fields.getTextInputValue('guilda_war_tag').toUpperCase();
    const attackerClan = await db.Clan.findById(user.clanId);
    
    if (attackerClan.tag === enemyTag) return interaction.reply({ content: '❌ Auto-ataque não permitido.', ephemeral: true });

    const defenderClan = await db.Clan.findOne({ tag: enemyTag });
    if (!defenderClan) return interaction.reply({ content: '❌ Guilda não encontrada.', ephemeral: true });

    if (attackerClan.bank < WAR_COST) return interaction.reply({ content: `❌ Cofre precisa de $${WAR_COST_FORMATTED}.`, ephemeral: true });
    
    if (attackerClan.lastWar) {
        const hours = (Date.now() - new Date(attackerClan.lastWar).getTime()) / 36e5;
        if (hours < WAR_COOLDOWN_HOURS) return interaction.reply({ content: `❌ Cooldown ativo. Espere ${Math.ceil(WAR_COOLDOWN_HOURS - hours)}h.`, ephemeral: true });
    }
    
    if (defenderClan.warShieldUntil && new Date(defenderClan.warShieldUntil) > new Date()) {
        return interaction.reply({ content: `❌ Guilda protegida por escudo.`, ephemeral: true });
    }

    const attackerPower = await calculateClanPower(attackerClan);
    const defenderPower = await calculateClanPower(defenderClan);

    // Fator Caos (RNG de +/- 20%)
    const attackerRNG = 0.8 + (Math.random() * 0.4); 
    const defenderRNG = 0.8 + (Math.random() * 0.4);

    const finalAttackerScore = Math.floor(attackerPower * attackerRNG);
    const finalDefenderScore = Math.floor(defenderPower * defenderRNG);
    const prob = finalAttackerScore > finalDefenderScore ? 'Alta' : 'Baixa';

    const embed = new EmbedBuilder()
        .setTitle(`⚔️ Guerra: [${attackerClan.tag}] vs [${defenderClan.tag}]`)
        .setDescription(`Custo: **$${WAR_COST_FORMATTED}**\nProbabilidade de Vitória: **${prob}**\n\nConfirmar ataque?`)
        .setColor(colors.error);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`guilda_btn_war_confirm_${enemyTag}`).setLabel('ATACAR').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('guilda_btn_cancel').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
    );

    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

async function executeWar(interaction, user, clan, enemyTag) {
    const attackerClan = await db.Clan.findById(clan._id);
    const defenderClan = await db.Clan.findOne({ tag: enemyTag });
    
    // Re-verificações básicas
    if (!defenderClan || attackerClan.bank < WAR_COST) return interaction.update({ content: '❌ Erro na validação final (Saldo ou Inimigo).', embeds: [], components: [] });

    attackerClan.bank -= WAR_COST;
    attackerClan.lastWar = new Date();

    const attackerPower = await calculateClanPower(attackerClan);
    const defenderPower = await calculateClanPower(defenderClan);
    const attackerRNG = 0.8 + (Math.random() * 0.4); 
    const defenderRNG = 0.8 + (Math.random() * 0.4);
    const finalAttackerScore = Math.floor(attackerPower * attackerRNG);
    const finalDefenderScore = Math.floor(defenderPower * defenderRNG);

    let embed;

    if (finalAttackerScore > finalDefenderScore) {
        // Win
        const stolen = Math.floor(defenderClan.bank * STEAL_PERCENTAGE);
        defenderClan.bank -= stolen;
        attackerClan.bank += stolen;
        attackerClan.wins++;
        attackerClan.honor += 50;
        defenderClan.losses++;
        defenderClan.honor = Math.max(0, defenderClan.honor - 25);
        defenderClan.warShieldUntil = new Date(Date.now() + (SHIELD_DURATION_HOURS * 36e5));

        embed = new EmbedBuilder()
            .setTitle('🏆 VITÓRIA!')
            .setDescription(`**[${attackerClan.tag}]** venceu **[${defenderClan.tag}]**!\n\n💰 Roubado: $${stolen.toLocaleString()}\n🎖️ Honra: +50`)
            .setColor(colors.success)
            .setImage('https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcDdtY254YmF4bmF4bmF4bmF4bmF4bmF4bmF4bmF4bmF4bmF4bmF4biZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3o7TKv6MgQfdSRT01G/giphy.gif');
    } else {
        // Loss
        attackerClan.losses++;
        attackerClan.honor = Math.max(0, attackerClan.honor - 20);
        defenderClan.wins++;
        defenderClan.honor += 30;

        embed = new EmbedBuilder()
            .setTitle('💀 DERROTA!')
            .setDescription(`O ataque falhou contra **[${defenderClan.tag}]**.\n\n💸 Prejuízo: Custo da guerra.\n📉 Honra: -20`)
            .setColor(colors.error);
    }

    await attackerClan.save();
    await defenderClan.save();

    return interaction.update({ embeds: [embed], components: [] });
}

async function calculateClanPower(clan) {
    let totalPower = 0;
    const membersToScan = clan.members.slice(0, 20); 
    const petPromises = membersToScan.map(m => db.getActivePet(m.userId));
    const pets = await Promise.all(petPromises);
    const validPets = pets.filter(p => p != null);
    
    const petStrengths = validPets.map(pet => {
        const stats = petBattleSystem.calculateStats(pet);
        return stats.atk + stats.def + stats.spd + (stats.maxHp / 10);
    });

    petStrengths.sort((a, b) => b - a);
    const top5Strengths = petStrengths.slice(0, 5);
    totalPower = top5Strengths.reduce((sum, val) => sum + val, 0);

    if (top5Strengths.length < 5) totalPower += (5 - top5Strengths.length) * 50; 
const defenseBonus = 1 + (clan.upgrades.defense * 0.05);
    return Math.floor(totalPower * defenseBonus);
}

// --- LOGO E PROMOÇÃO ---

async function updateClanLogo(interaction, user) {
    if (!user.clanId) return interaction.reply({ content: '❌ Você não tem guilda.', ephemeral: true });
    
    const logoUrl = interaction.fields.getTextInputValue('guilda_logo_url').trim();
    
    // Verificar se é para remover a imagem
    if (logoUrl.toLowerCase() === 'remover' || logoUrl.toLowerCase() === 'null' || logoUrl === '') {
        const clan = await db.Clan.findById(user.clanId);
        clan.logo = null;
        await clan.save();
        return interaction.reply({ content: '✅ Foto da guilda removida!', ephemeral: true });
    }
    
    // Validar URL
    try {
        new URL(logoUrl);
    } catch (_) {
        return interaction.reply({ content: '❌ URL inválida! Use uma URL válida ou digite "remover" para tirar a foto.', ephemeral: true });
    }

    const clan = await db.Clan.findById(user.clanId);
    clan.logo = logoUrl;
    await clan.save();

    return interaction.reply({ content: '✅ Foto da guilda atualizada com sucesso!', ephemeral: true });
}

async function promoteMember(interaction, user, targetId) {
    if (!user.clanId) return interaction.reply({ content: '❌ Você não tem guilda.', ephemeral: true });
    if (user.clanRole !== 'leader') return interaction.reply({ content: '❌ Apenas o Líder pode promover membros.', ephemeral: true });
    
    const targetDb = await db.getUser(targetId);
    if (targetDb.clanId !== user.clanId) return interaction.reply({ content: '❌ Usuário não é da sua guilda.', ephemeral: true });
    if (targetDb.clanRole === 'leader') return interaction.reply({ content: '❌ Este usuário já é o Líder.', ephemeral: true });

    const clan = await db.Clan.findById(user.clanId);
    
    // Lógica de promoção: member -> captain -> leader
    if (targetDb.clanRole === 'member') {
        // Promover para Vice Líder (Captain)
        targetDb.clanRole = 'captain';
        clan.members = clan.members.map(m => {
            if (m.userId === targetId) {
                m.role = 'captain';
            }
            return m;
        });
        await targetDb.save();
        await clan.save();
        
        return interaction.reply({ content: `✅ **<@${targetId}>** foi promovido a **Vice Líder**! ⭐`, ephemeral: true });
    } else if (targetDb.clanRole === 'captain') {
        // Promover para Líder (领导者)
        const oldLeaderId = clan.leaderId;
        
        // Remover líder atual
        clan.members = clan.members.map(m => {
            if (m.userId === oldLeaderId) {
                m.role = 'member';
            }
            if (m.userId === targetId) {
                m.role = 'leader';
            }
            return m;
        });
        
        // Atualizar líder no banco
        clan.leaderId = targetId;
        
        // Atualizar roles dos usuários
        const oldLeader = await db.getUser(oldLeaderId);
        oldLeader.clanRole = 'member';
        await oldLeader.save();
        
        targetDb.clanRole = 'leader';
        await targetDb.save();
        await clan.save();
        
        return interaction.reply({ content: `✅ **<@${targetId}>** agora é o novo **Líder** da guilda! 👑`, ephemeral: true });
    }
}

async function updateClanTax(interaction, user) {
    const taxRate = parseInt(interaction.fields.getTextInputValue('guilda_tax_rate')) || 0;
    
    // Validar taxa (0-15%)
    if (taxRate < 0 || taxRate > 15) {
        return interaction.reply({ 
            content: '❌ **Taxa inválida!** A taxa deve estar entre **0% e 15%**.', 
            ephemeral: true 
        });
    }
    
    const clan = await db.Clan.findById(user.clanId);
    if (!clan) {
        return interaction.reply({ content: '❌ Erro: Guilda não encontrada.', ephemeral: true });
    }
    
    const oldTax = clan.taxRate || 0;
    clan.taxRate = taxRate;
    await clan.save();
    
    const embed = new EmbedBuilder()
        .setTitle('💸 Taxa da Guilda Atualizada')
        .setDescription(`A taxa de **[${clan.tag}] ${clan.name}** foi atualizada com sucesso!`)
        .addFields(
            { name: '📉 Taxa Anterior', value: `${oldTax}%`, inline: true },
            { name: '📈 Nova Taxa', value: `${taxRate}%`, inline: true },
            { name: '💰 Impacto', value: taxRate > 0 ? `Membros pagarão ${taxRate}% sobre seus ganhos` : 'Membros não pagarão taxa', inline: false }
        )
        .setColor(colors.success)
        .setFooter({ text: 'A taxa será aplicada automaticamente nos próximos trabalhos dos membros.' });
    
    return interaction.reply({ embeds: [embed], ephemeral: true });
}
