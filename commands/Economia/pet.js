const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, UserSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, MessageFlags } = require('discord.js');
const db = require('../../database');
const colors = require('../../colors.json');
const pets = require('../../pets.json');
const petItems = require('../../pet_items.json');
const petBattleSystem = require('../../systems/petBattleSystem');
const { randomUUID } = require('crypto');
const { checkPetStatus, getPetMood } = require('../../systems/petSystem');
const eventSystem = require('../../systems/eventSystem');

// --- LÓGICA DE ROTAÇÃO DA LOJA DE PETS (Reutilizada) ---
async function getPetShopRotation() {
    let rotation = await db.getGlobalConfig('petShopRotation');
    const now = Date.now();

    if (!rotation || rotation.nextRotation < now) {
        const stockMap = {};
        for (const item of petItems) {
            if (item.type === 'egg') stockMap[item.id] = 999;
            else if (item.price < 500) stockMap[item.id] = 50;
            else if (item.price < 2000) stockMap[item.id] = 20;
            else stockMap[item.id] = 5;
        }

        const currentHour = new Date().getHours();
        const hoursToAdd = 4 - (currentHour % 4);
        const nextRotationDate = new Date();
        nextRotationDate.setHours(currentHour + hoursToAdd, 0, 0, 0);

        rotation = {
            items: petItems.map(i => i.id),
            stock: stockMap,
            nextRotation: nextRotationDate.getTime()
        };
        await db.saveGlobalConfig('petShopRotation', rotation);
    }
    return rotation;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pet')
        .setDescription('🐕 Central de Comando dos Pets (Gerencie, Alimente, Brinque e Compre).'),

    async execute(interaction) {
        await this.showMainDashboard(interaction);
    },

    // --- DASHBOARDS E MENUS ---

    async showMainDashboard(interaction, isUpdate = false) {
        const userId = interaction.user.id;
        const user = await db.getUser(userId);
        let activePet = await db.getActivePet(userId);
        const userPets = await db.getUserPets(userId);

        // Atualiza status do pet (Fome/Diversão) antes de mostrar
        if (activePet) {
            const updatedPet = await checkPetStatus(activePet, user, interaction.client);
            if (!updatedPet) {
                // Pet morreu durante o check
                activePet = null;
                // O checkPetStatus já envia a notificação de morte, então só atualizamos a UI aqui
            } else {
                activePet = updatedPet;
            }
        }

        const embed = new EmbedBuilder()
            .setColor(colors.default)
            .setTitle('🐾 Central de Comando Tático: Unidade K9')
            .setDescription(`Bem-vindo, **${interaction.user.username}**. Aqui você gerencia seus companheiros de missão.\nUse os botões abaixo para interagir.`);

        const activeEvent = await eventSystem.getWeeklyEvent();
        if (activeEvent) {
            const eventDecay = eventSystem.getEventMultiplier(activeEvent, 'pet_decay_mult');
            const eventInteract = eventSystem.getEventMultiplier(activeEvent, 'pet_interaction_mult');
            const eventImmunity = eventSystem.getEventMultiplier(activeEvent, 'pet_decay_immunity', false);
            
            let eventText = `\n🌍 **Evento Global Ativo:** ${activeEvent.name}\n`;
            if (eventDecay !== 1.0) eventText += `📉 Perda de Status: ${eventDecay}x\n`;
            if (eventInteract !== 1.0) eventText += `💕 Interações: ${eventInteract}x\n`;
            if (eventImmunity) eventText += `🛡️ **Imunidade a Decaimento!**\n`;
            
            embed.addFields({ name: '📢 Boletim do QG', value: eventText });
        }

        if (activePet) {
            const template = pets.find(p => p.id === activePet.petId);
            const mood = getPetMood(activePet);
            
            // Passiva Escalonada (N1, N5, N10)
            const level = activePet.level || 1;
            const p = template.passive || {};
            
            // Helper para formatar linhas de habilidade
            const formatSkill = (lvlReq, skillData) => {
                if (!skillData) return `🔒 **N${lvlReq}:** Habilidade não definida`;
                const isUnlocked = level >= lvlReq;
                const icon = isUnlocked ? '✅' : '🔒';
                const status = isUnlocked ? '' : ` _(Desbloqueia no Lvl ${lvlReq})_`;
                return `${icon} **N${lvlReq}:** ${skillData.desc}${status}`;
            };

            const n1 = formatSkill(1, p.n1);
            const n5 = formatSkill(5, p.n5);
            const n10 = formatSkill(10, p.n10);

            const passiveDisplay = `${n1}\n${n5}\n${n10}`;

            embed.addFields({
                name: `🟢 Pet Ativo: ${activePet.name} (${template.emoji})`,
                value: `**Nível:** ${activePet.level}/10 | **XP:** ${activePet.xp}/${activePet.level * 100}\n**Energia:** ${activePet.energy}% | **Diversão:** ${activePet.fun}% | **Humor:** ${mood}\n\n**Habilidades Passivas:**\n${passiveDisplay}`
            });
            embed.setThumbnail(template.image || null); // Se tiver imagem no JSON
        } else {
            embed.addFields({
                name: '🔴 Nenhum Pet Ativo',
                value: 'Você não tem um companheiro equipado no momento.\nUse o botão **"Meus Pets"** para equipar um ou **"Loja"** para comprar um ovo.'
            });
        }

        // Botões de Ação
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('pet_menu_list').setLabel('Meus Pets (Equipar)').setEmoji('🐕').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('pet_menu_shop').setLabel('Loja').setEmoji('🛒').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('pet_menu_eggs').setLabel('Meus Ovos').setEmoji('🥚').setStyle(ButtonStyle.Secondary)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('pet_menu_feed').setLabel('Alimentar').setEmoji('🍖').setStyle(ButtonStyle.Secondary).setDisabled(!activePet),
            new ButtonBuilder().setCustomId('pet_menu_play').setLabel('Brincar').setEmoji('🎾').setStyle(ButtonStyle.Secondary).setDisabled(!activePet),
            new ButtonBuilder().setCustomId('pet_menu_rename').setLabel('Renomear').setEmoji('✏️').setStyle(ButtonStyle.Secondary).setDisabled(!activePet),
            new ButtonBuilder().setCustomId('pet_menu_duel').setLabel('Duelar').setEmoji('⚔️').setStyle(ButtonStyle.Danger).setDisabled(!activePet)
        );

        const payload = { embeds: [embed], components: [row1, row2] };

        try {
            if (isUpdate) {
                if (interaction.replied || interaction.deferred) {
                    await interaction.editReply(payload);
                } else {
                    await interaction.update(payload);
                }
            } else {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral });
                } else {
                    await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
                }
            }
        } catch (error) {
            console.error('Erro ao responder em showMainDashboard:', error);
            // Fallback final
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ Ocorreu um erro ao carregar o menu.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    },

    async showPetList(interaction) {
        const userId = interaction.user.id;
        const userPets = await db.getUserPets(userId);
        const activePet = await db.getActivePet(userId);

        if (!userPets || userPets.length === 0) {
            return interaction.update({ content: '🏚️ Você não tem nenhum pet. Compre um ovo na Loja!', embeds: [], components: [] });
        }

        const embed = new EmbedBuilder()
            .setColor(colors.default)
            .setTitle('🐕 Seus Pets - Seleção Tática')
            .setDescription('Selecione abaixo qual pet deseja **EQUIPAR** para suas missões.');

        const options = userPets.map(p => {
            const template = pets.find(t => t.id === p.petId);
            const isActive = activePet ? activePet.id === p.id : false;
            return {
                label: `${isActive ? '[ATIVO] ' : ''}${p.name} (Lvl ${p.level})`,
                description: `N1: ${template.passive.n1.desc}`.substring(0, 95),
                value: p.id,
                emoji: template.emoji,
                default: isActive
            };
        });

        const select = new StringSelectMenuBuilder()
            .setCustomId('pet_select_equip')
            .setPlaceholder('Selecione um pet para equipar...')
            .addOptions(options.slice(0, 25)); // Limite do Discord

        const row = new ActionRowBuilder().addComponents(select);
        const rowBack = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('pet_menu_main').setLabel('Voltar').setStyle(ButtonStyle.Secondary)
        );

        await interaction.update({ embeds: [embed], components: [row, rowBack] });
    },

    async showShop(interaction) {
        const userId = interaction.user.id;
        const user = await db.getUser(userId);
        const rotation = await getPetShopRotation();

        const diff = rotation.nextRotation - Date.now();
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const timeString = `${hours}h ${minutes}m`;

        const embed = new EmbedBuilder()
            .setColor(colors.success)
            .setTitle('🏪 Pet Shop Tático')
            .setDescription(`**Saldo:** 💰 $${user.wallet.toLocaleString()}\n**Rotação:** <t:${Math.floor(rotation.nextRotation / 1000)}:t> (Faltam ${timeString})\n\nSelecione uma categoria no menu abaixo para ver os produtos.`)
            .addFields(
                { name: '🥚 Ovos', value: 'Ovos com novos pets.', inline: true },
                { name: '🍖 Alimentos', value: 'Rações e petiscos para energia.', inline: true },
                { name: '🎾 Brinquedos', value: 'Itens para diversão e XP.', inline: true }
            );

        const select = new StringSelectMenuBuilder()
            .setCustomId('pet_shop_cat_select')
            .setPlaceholder('Selecione uma categoria...')
            .addOptions([
                { label: 'Ovos', description: 'Comprar novos pets', value: 'egg', emoji: '🥚' },
                { label: 'Alimentos', description: 'Comida para recuperar energia', value: 'food', emoji: '🍖' },
                { label: 'Brinquedos', description: 'Itens de diversão', value: 'toy', emoji: '🎾' }
            ]);

        const row = new ActionRowBuilder().addComponents(select);
        const rowBack = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('pet_menu_main').setLabel('Voltar ao Menu').setStyle(ButtonStyle.Secondary)
        );

        const payload = { embeds: [embed], components: [row, rowBack] };
        if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
             await interaction.update(payload);
        } else {
             await interaction.reply({ ...payload, ephemeral: true });
        }
    },

    async showShopCategory(interaction, category) {
        const userId = interaction.user.id;
        const user = await db.getUser(userId);
        const rotation = await getPetShopRotation();

        let itemsToShow = [];
        let categoryName = '';
        
        if (category === 'egg') {
            itemsToShow = petItems.filter(i => i.type === 'egg');
            categoryName = '🥚 Ovos';
        } else if (category === 'food') {
            itemsToShow = petItems.filter(i => i.type === 'food');
            categoryName = '🍖 Alimentos e Suprimentos';
        } else {
            itemsToShow = petItems.filter(i => i.type !== 'egg' && i.type !== 'food');
            categoryName = '🎾 Brinquedos e Outros';
        }

        const formatLine = (item) => {
            const stock = rotation.stock[item.id] || 0;
            const stockDisplay = stock === 999 ? '∞' : stock;
            
            // Starter Egg Display Logic
            let priceDisplay = `$${item.price.toLocaleString()}`;
            if (!user.starterEggClaimed && item.id === 'ovo_comum') {
                priceDisplay = `~~$${item.price.toLocaleString()}~~ **GRÁTIS (1º Ovo)**`;
            }

            let typeLabel = item.type === 'toy' ? '♾️ Permanente' : '⚡ Consumível';
            return `**${item.name}**\n📜 ${item.description}\n💰 ${priceDisplay} | 📦 Estoque: ${stockDisplay} | ${typeLabel}\n`;
        };

        const embed = new EmbedBuilder()
            .setColor(colors.success)
            .setTitle(`🏪 Pet Shop: ${categoryName}`)
            .setDescription(`**Saldo:** 💰 $${user.wallet.toLocaleString()}\n\nSelecione um item abaixo para comprar.`)
            .addFields(
                { name: 'Produtos Disponíveis', value: itemsToShow.map(formatLine).join('\n') || 'Nenhum item disponível.', inline: false }
            );

        const selectOptions = itemsToShow.map(i => {
            let emoji = '📦';
            if (i.type === 'egg') emoji = '🥚';
            else if (i.type === 'food') emoji = '🍖';
            else if (i.type === 'toy') emoji = '🎾';

            let priceLabel = `$${i.price}`;
            if (!user.starterEggClaimed && i.id === 'ovo_comum') {
                priceLabel = 'GRÁTIS';
            }

            let typeLabel = i.type === 'toy' ? '♾️ Permanente' : '⚡ Consumível';

            return {
                label: `${i.name} - ${priceLabel}`,
                description: `${typeLabel} | ${i.description.substring(0, 80)}`,
                value: i.id,
                emoji: emoji
            };
        });

        const select = new StringSelectMenuBuilder()
            .setCustomId('pet_shop_item_select')
            .setPlaceholder('Escolha um item para comprar...')
            .addOptions(selectOptions.slice(0, 25));

        const row = new ActionRowBuilder().addComponents(select);
        const rowBack = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('pet_menu_shop').setLabel('Voltar às Categorias').setStyle(ButtonStyle.Secondary)
        );

        await interaction.update({ embeds: [embed], components: [row, rowBack] });
    },

    async showFeedMenu(interaction) {
        const userId = interaction.user.id;
        const activePet = await db.getActivePet(userId);
        if (!activePet) return this.showMainDashboard(interaction, true);

        const inventory = await db.getInventory(userId);
        const consumables = petItems.filter(i => (i.type === 'food' || i.type === 'medicine') && inventory[i.id] > 0);

        if (consumables.length === 0) {
            return interaction.reply({ content: '❌ Sem suprimentos! Compre comida ou remédios na Loja.', flags: MessageFlags.Ephemeral });
        }

        const embed = new EmbedBuilder()
            .setColor(colors.default)
            .setTitle(`🏥 Cuidar de ${activePet.name}`)
            .setDescription(`Energia Atual: **${activePet.energy}%** | XP Atual: **${activePet.xp}**\nEscolha um item do seu inventário:`);

        const select = new StringSelectMenuBuilder()
            .setCustomId('pet_select_feed')
            .setPlaceholder('Escolha o item...')
            .addOptions(consumables.map(f => {
                let label = f.name;
                let emoji = '🍖';
                
                if (f.type === 'medicine') emoji = '💊';
                if (f.id === 'cafe_expresso') emoji = '☕';
                if (f.effect === 'xp_boost') emoji = '🧪';

                if (f.energy > 0) label += ` (+${f.energy} Energy)`;
                if (f.effect === 'xp_boost') label += ` (+${f.value} XP)`;
                if (f.effect === 'revive') label += ` (Reviver)`;

                return {
                    label: label,
                    description: `Quantidade: ${inventory[f.id]}`,
                    value: f.id,
                    emoji: emoji
                };
            }));

        const row = new ActionRowBuilder().addComponents(select);
        const rowBack = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('pet_menu_main').setLabel('Voltar').setStyle(ButtonStyle.Secondary)
        );

        await interaction.update({ embeds: [embed], components: [row, rowBack] });
    },

    async showPlayMenu(interaction) {
        const userId = interaction.user.id;
        const activePet = await db.getActivePet(userId);
        if (!activePet) return this.showMainDashboard(interaction, true);

        if (activePet.fun >= 100) {
            return interaction.reply({ 
                content: `🛑 **${activePet.name}** já está se divertindo ao máximo! Tente trabalhar ou fazer missões para ele cansar um pouco.`, 
                flags: MessageFlags.Ephemeral 
            });
        }

        const inventory = await db.getInventory(userId);
        const toys = petItems.filter(i => i.type === 'toy' && inventory[i.id] > 0);

        if (toys.length === 0) {
            return interaction.reply({ content: '❌ Sem brinquedos! Compre na Loja.', flags: MessageFlags.Ephemeral });
        }

        const embed = new EmbedBuilder()
            .setColor(colors.default)
            .setTitle(`🎾 Brincar com ${activePet.name}`)
            .setDescription(`Diversão Atual: **${activePet.fun}%**\nEscolha um brinquedo:`);

        const select = new StringSelectMenuBuilder()
            .setCustomId('pet_select_play')
            .setPlaceholder('Escolha o brinquedo...')
            .addOptions(toys.map(t => ({
                label: `${t.name} (+${t.fun} Fun)`,
                description: `Quantidade: ${inventory[t.id]}`,
                value: t.id,
                emoji: '🎾'
            })));

        const row = new ActionRowBuilder().addComponents(select);
        const rowBack = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('pet_menu_main').setLabel('Voltar').setStyle(ButtonStyle.Secondary)
        );

        await interaction.update({ embeds: [embed], components: [row, rowBack] });
    },

    async showEggInventory(interaction) {
        const userId = interaction.user.id;
        let user = await db.getUser(userId);

        // MIGRATION: Recuperar ovos da antiga incubadora
        if (user.incubating && user.incubating.length > 0) {
            for (const egg of user.incubating) {
                await db.addItem(userId, egg.type, 1);
            }
            // Limpa incubadora e recarrega user
            user = await db.updateUser(userId, { incubating: [] });
            
            // Tenta enviar aviso (pode falhar se for ephemeral update, mas ok)
            try {
                if (!interaction.replied && !interaction.deferred) {
                     // Se ainda não respondeu, ok. Mas aqui estamos dentro do fluxo de resposta.
                     // Vamos apenas garantir que o inventário novo seja pego.
                }
            } catch (e) {}
        }

        const inventory = await db.getInventory(userId);
        const userPets = await db.getUserPets(userId);

        const eggsInInventory = petItems.filter(i => i.type === 'egg' && inventory[i.id] > 0);

        const embed = new EmbedBuilder()
            .setColor(colors.default)
            .setTitle('🥚 Inventário de Ovos')
            .setDescription('Aqui estão seus ovos. Selecione um abaixo para **chocar instantaneamente**!');

        const rows = [];

        if (eggsInInventory.length > 0) {
            const options = eggsInInventory.map(e => ({
                label: `${e.name} (${inventory[e.id]}x)`,
                description: e.description.substring(0, 95),
                value: e.id,
                emoji: '🥚'
            }));

            const select = new StringSelectMenuBuilder()
                .setCustomId('pet_select_hatch_instant')
                .setPlaceholder('Selecione um ovo para chocar...')
                .addOptions(options);

            rows.push(new ActionRowBuilder().addComponents(select));
        } else {
            embed.setDescription('Você não tem ovos no momento.\nCompre um na **Loja** ou tente a sorte em missões.');
            
        // Starter Rescue Logic / Auto-Fix
        const hasPets = userPets && userPets.length > 0;
        
        // Se o usuário diz que pegou o ovo (starterEggClaimed) mas não tem pets e não tem ovos...
        // BUG FIX: Vamos checar e devolver o ovo automaticamente ou mostrar o botão.
        if (user.starterEggClaimed && !hasPets && eggsInInventory.length === 0) {
             // Verificar se realmente não tem nenhum ovo no inventário bruto
             const totalEggs = Object.entries(inventory).filter(([k, v]) => k.startsWith('ovo_') && v > 0).length;
             
             if (totalEggs === 0) {
                 embed.setDescription('⚠️ **Atenção:** Detectamos que você resgatou seu Ovo Inicial mas ele não aparece.\n\nClique abaixo para recuperar seu ovo!');
                 const rescueRow = new ActionRowBuilder().addComponents(
                     new ButtonBuilder()
                         .setCustomId('pet_rescue_starter')
                         .setLabel('🆘 RECUPERAR OVO AGORA')
                         .setStyle(ButtonStyle.Danger)
                         .setEmoji('🥚')
                 );
                 rows.push(rescueRow);
             }
        }
        }

        const rowBack = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('pet_menu_main').setLabel('Voltar').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('pet_menu_shop').setLabel('Comprar Ovos').setStyle(ButtonStyle.Success).setEmoji('🛒')
        );
        rows.push(rowBack);

        const payload = { embeds: [embed], components: rows, fetchReply: true };
        if (interaction.isButton() || interaction.isStringSelectMenu()) await interaction.update(payload);
        else await interaction.reply(payload);
    },

    async hatchEgg(interaction, eggId) {
        const userId = interaction.user.id;
        const inventory = await db.getInventory(userId);

        if (!inventory[eggId] || inventory[eggId] < 1) {
             return interaction.reply({ content: '❌ Você não tem este ovo!', flags: MessageFlags.Ephemeral });
        }

        // Helper de espera
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

        // Animação de suspense
        const embed = new EmbedBuilder()
            .setColor(colors.warning)
            .setTitle('🥚 Incubadora')
            .setDescription('O ovo está começando a se mexer...');

        await interaction.update({ embeds: [embed], components: [] });
        await wait(2000);

        embed.setDescription('💥 *CRACK!* Uma rachadura apareceu na casca...');
        await interaction.editReply({ embeds: [embed] });
        await wait(2000);

        embed.setDescription('✨ Uma luz forte está saindo de dentro...');
        await interaction.editReply({ embeds: [embed] });
        await wait(2000);

        // Remove do inventário
        await db.removeItem(userId, eggId, 1);

        // Lógica Gacha
        let pool = [];
        if (eggId === 'ovo_comum') {
            const roll = Math.random();
            if (roll < 0.8) pool = pets.filter(p => p.rarity === 'comum');
            else pool = pets.filter(p => p.rarity === 'incomum');
        } else if (eggId === 'ovo_raro') {
            const roll = Math.random();
            if (roll < 0.6) pool = pets.filter(p => p.rarity === 'incomum');
            else pool = pets.filter(p => p.rarity === 'raro');
        } else if (eggId === 'ovo_exclusivo') {
            const roll = Math.random();
            if (roll < 0.9999) pool = pets.filter(p => p.rarity === 'raro');
            else pool = pets.filter(p => p.rarity === 'exclusivo');
        } else {
            pool = pets.filter(p => p.rarity === 'comum');
        }

        const chosen = pool[Math.floor(Math.random() * pool.length)];
        const newPetData = { id: randomUUID(), petId: chosen.id, name: chosen.name, rarity: chosen.rarity, createdAt: Date.now() };
        await db.createPet(userId, newPetData);

        // Resultado Final
        const resultEmbed = new EmbedBuilder()
            .setColor(colors.success)
            .setTitle(`🎉 PARABÉNS! Nasceu um ${chosen.name}! চাহ`)
            .setDescription(`**Raridade:** ${chosen.rarity.toUpperCase()}\n${chosen.description}\n\nO pet foi adicionado à sua coleção!`)
            .setThumbnail(chosen.image || null)
            .setFooter({ text: 'Cuide bem dele!' });

        const rowBack = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('pet_menu_list').setLabel('Ver Meus Pets').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('pet_menu_eggs').setLabel('Abrir Outro Ovo').setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ embeds: [resultEmbed], components: [rowBack] });

        // Notificação Global para Pets EXCLUSIVOS
        if (['exclusivo'].includes(chosen.rarity)) {
            const globalEmbed = new EmbedBuilder()
                .setTitle('🌍 EVENTO GLOBAL: EXCLUSIVO DESCOBERTO! 🌍')
                .setDescription(`🏆 **UM JOGADOR ACABA DE OBTER UM PET EXCLUSIVO!**\n\n🎉 Parabéns a **${interaction.user.username}** por chocar o exclusivo **${chosen.name}**!`)
                .setColor('#FF0000')
                .setTimestamp();

            const guilds = interaction.client.guilds.cache;
            for (const [guildId, guild] of guilds) {
                try {
                    const config = await db.GuildConfig.findOne({ guildId });
                    let channelId = config?.lastCommandChannelId || config?.logsChannel;
                    let channel = null;
                    if (channelId) channel = guild.channels.cache.get(channelId);
                    if (!channel) channel = guild.systemChannel;
                    if (channel) await channel.send({ embeds: [globalEmbed] }).catch(() => {});
                } catch (err) {}
            }
        }
    },

    async showDuelMenu(interaction) {
        const embed = new EmbedBuilder()
            .setColor(colors.warning)
            .setTitle('⚔️ Arena de Batalha Pet')
            .setDescription('Selecione um oponente para desafiar para um duelo mortal (ou quase).');

        const select = new UserSelectMenuBuilder()
            .setCustomId('pet_select_duel_opponent')
            .setPlaceholder('Escolha um usuário para duelar...');

        const row = new ActionRowBuilder().addComponents(select);
        const rowBack = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('pet_menu_main').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
        );

        await interaction.update({ embeds: [embed], components: [row, rowBack] });
    },

    // --- HANDLERS ---

    async handleButton(interaction) {
        const { customId } = interaction;

        if (customId === 'pet_menu_duel') return this.showDuelMenu(interaction);
        if (customId.startsWith('pet_duel_accept_') || customId.startsWith('pet_duel_deny_')) {
            return petBattleSystem.handleDuelInteraction(interaction);
        }

        // --- MANUSEIO DA APOSTA (Faltava isso!) ---
        if (customId.startsWith('pet_bet_')) {
            const parts = customId.split('_');
            const amountStr = parts[2]; // 0, 100, 1000, or 'custom'
            const targetId = parts[3];

            if (amountStr === 'custom') {
                const modal = new ModalBuilder()
                    .setCustomId(`pet_modal_bet_${targetId}`)
                    .setTitle('Definir Aposta');

                const amountInput = new TextInputBuilder()
                    .setCustomId('bet_amount')
                    .setLabel('Valor da aposta')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Ex: 500')
                    .setRequired(true);

                const row = new ActionRowBuilder().addComponents(amountInput);
                modal.addComponents(row);
                return interaction.showModal(modal);
            } else {
                const amount = parseInt(amountStr);
                return petBattleSystem.processDuelBet(interaction, targetId, amount);
            }
        }

        if (customId === 'pet_rescue_starter') {
             await db.addItem(interaction.user.id, 'ovo_comum', 1);
             await interaction.reply({ content: '✅ **Ovo recuperado com sucesso!** Verifique seu inventário de Ovos.', ephemeral: true });
             return this.showEggInventory(interaction);
        }

        if (customId === 'pet_menu_main') return this.showMainDashboard(interaction, true);
        if (customId === 'pet_menu_list') return this.showPetList(interaction);
        if (customId === 'pet_menu_shop') return this.showShop(interaction);
        if (customId === 'pet_menu_feed') return this.showFeedMenu(interaction);
        if (customId === 'pet_menu_play') return this.showPlayMenu(interaction);
        if (customId === 'pet_menu_eggs') return this.showEggInventory(interaction);
        
        if (customId === 'pet_menu_rename') {
            const modal = new ModalBuilder()
                .setCustomId('pet_modal_rename')
                .setTitle('Renomear Pet');
            
            const nameInput = new TextInputBuilder()
                .setCustomId('new_name')
                .setLabel('Novo nome para o pet')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(32)
                .setRequired(true);
            
            modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
            return interaction.showModal(modal);
        }
    },

    async handleSelect(interaction) {
        const { customId, values, user } = interaction;
        const selectedId = values[0];

        // DUELO - SELEÇÃO DE OPONENTE
        if (customId === 'pet_select_duel_opponent') {
            return petBattleSystem.startDuelRequest(interaction, selectedId);
        }

        // NAVEGAÇÃO LOJA
        if (customId === 'pet_shop_cat_select') {
            return this.showShopCategory(interaction, selectedId);
        }

        // SELEÇÃO DE ITEM (Mostrar Modal)
        if (customId === 'pet_shop_item_select') {
            const item = petItems.find(i => i.id === selectedId);
            if (!item) return interaction.reply({ content: '❌ Item não encontrado.', ephemeral: true });

            const modal = new ModalBuilder()
                .setCustomId(`pet_shop_buy_modal_${item.id}`)
                .setTitle(`Comprar: ${item.name}`);

            const qtdInput = new TextInputBuilder()
                .setCustomId('quantity')
                .setLabel('Quantidade a comprar')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ex: 1')
                .setRequired(true)
                .setValue('1');

            const row = new ActionRowBuilder().addComponents(qtdInput);
            modal.addComponents(row);

            return interaction.showModal(modal);
        }

        // EQUIPAR
        if (customId === 'pet_select_equip') {
            const pet = await db.getPet(selectedId);
            if (pet.userId !== user.id) return interaction.reply({ content: '❌ Erro de propriedade.', ephemeral: true });
            
            await db.updateUser(user.id, { activePetId: pet.id });
            await interaction.reply({ content: `✅ **${pet.name}** foi equipado!`, ephemeral: true });
            return this.showMainDashboard(interaction, false); 
        }

        // COMPRAR (LEGADO - Mantido por segurança, mas fluxo novo usa Modal)
        if (customId === 'pet_select_buy') {
            // ... (código antigo removido ou mantido se necessário, mas vou remover para limpar)
            return interaction.reply({ content: '❌ Menu antigo. Por favor, reabra a loja.', ephemeral: true });
        }

        // CUIDAR (Alimentar / Medicar)
        if (customId === 'pet_select_feed') {
            const activePet = await db.getActivePet(user.id);
            const item = petItems.find(i => i.id === selectedId);
            
            await db.removeItem(user.id, item.id, 1);
            
            let newEnergy = activePet.energy;
            let newFun = activePet.fun;
            let xpGain = 0;
            let msg = "";

            // Lógica por Efeito
            if (item.effect === 'revive') {
                newEnergy = 50; // Revive com 50%
                newFun = 50;
                msg = `🚑 **${activePet.name}** foi reanimado com sucesso!`;
            } else if (item.id === 'cafe_expresso') {
                newEnergy = 100;
                msg = `☕ **${activePet.name}** tomou um café expresso e está **100% Pilhado**!`;
            } else {
                // Comida normal / Vitaminas
                newEnergy = Math.min(100, activePet.energy + (item.energy || 0));
                newFun = Math.min(100, activePet.fun + (item.fun || 0));
                
                if (item.effect === 'xp_boost') {
                    xpGain = item.value || 0;
                    msg = `🧪 **${activePet.name}** tomou **${item.name}**!`;
                } else {
                    msg = `✅ **${activePet.name}** consumiu **${item.name}**!`;
                }
            }
            
            // LEVEL UP CHECK
            let currentXp = activePet.xp + xpGain;
            let currentLevel = activePet.level;
            const xpNeeded = currentLevel * 100;
            let leveledUp = false;
            const maxLevel = 10;

            if (currentLevel < maxLevel && currentXp >= xpNeeded) {
                currentLevel++;
                currentXp -= xpNeeded;
                leveledUp = true;
                newEnergy = 100; // Recupera tudo ao upar
                newFun = 100;
                msg += `\n🎉 **LEVEL UP!** ${activePet.name} subiu para o **Nível ${currentLevel}**!`;
                
                if (currentLevel === 5) msg += `\n🔓 **Nova Habilidade Desbloqueada (N5)!**`;
                else if (currentLevel === 10) msg += `\n🔓 **Nova Habilidade Desbloqueada (N10)!**`;
                else msg += `\n✨ **Atributos Melhorados!**`;
            } else if (currentLevel >= maxLevel) {
                 // XP continua acumulando mas não upa mais que 10
                 if (currentXp >= xpNeeded) currentXp = xpNeeded; // Capa no max xp do nivel maximo? Ou deixa estourar?
                 // Melhor deixar capado no max para não bugar display: 1000/1000 (MAX)
                 currentXp = Math.min(currentXp, currentLevel * 100);
            }

            await db.updatePet(activePet.id, { 
                energy: newEnergy, 
                fun: newFun,
                xp: currentXp,
                level: currentLevel,
                timesFed: (activePet.timesFed || 0) + 1
            });
            
            if (xpGain > 0 && !leveledUp) msg += `\n🆙 Ganhou **+${xpGain} XP**!`;
            if (newEnergy === 100 && item.id !== 'cafe_expresso' && !leveledUp) msg += `\n⚡ Energia cheia!`;
            
            await interaction.reply({ content: msg, ephemeral: true });
            return this.showMainDashboard(interaction, true);
        }

        // BRINCAR
        if (customId === 'pet_select_play') {
            const activePet = await db.getActivePet(user.id);
            
            if (activePet.fun >= 100) {
                return interaction.reply({ 
                    content: `🛑 **${activePet.name}** já está se divertindo ao máximo!`, 
                    flags: MessageFlags.Ephemeral 
                });
            }

            const toy = petItems.find(i => i.id === selectedId);
            
            let newEnergy = Math.max(0, activePet.energy + (toy.energy || -10));
            let newFun = Math.min(100, activePet.fun + toy.fun);
            
            // Atualizar Missão
            try {
                const missionSystem = require('../../systems/missionSystem');
                await missionSystem.checkMission(user.id, 'pet_play', 1, interaction);
            } catch (err) {
                console.error('Erro missão pet:', err);
            }

            // Level Up Check
            let currentXp = activePet.xp + 10;
            let currentLevel = activePet.level;
            const xpNeeded = currentLevel * 100;
            const maxLevel = 10;
            let msg = `✅ Brincou com **${activePet.name}**! (+10 XP)`;

            if (currentLevel < maxLevel && currentXp >= xpNeeded) {
                currentLevel++;
                currentXp -= xpNeeded;
                newEnergy = 100;
                newFun = 100;
                msg += `\n🎉 **LEVEL UP!** ${activePet.name} subiu para o **Nível ${currentLevel}**!`;
                
                if (currentLevel === 5) msg += `\n🔓 **Nova Habilidade Desbloqueada (N5)!**`;
                else if (currentLevel === 10) msg += `\n🔓 **Nova Habilidade Desbloqueada (N10)!**`;
                else msg += `\n✨ **Atributos Melhorados!**`;
            } else if (currentLevel >= maxLevel) {
                currentXp = Math.min(currentXp, currentLevel * 100);
            }
            
            await db.updatePet(activePet.id, { 
                energy: newEnergy, 
                fun: newFun, 
                xp: currentXp,
                level: currentLevel,
                timesPlayed: (activePet.timesPlayed || 0) + 1
            });
            
            await interaction.reply({ content: msg, ephemeral: true });
            return this.showMainDashboard(interaction, true);
        }

        // CHOCAR OVO (INSTANTÂNEO)
        if (customId === 'pet_select_hatch_instant') {
            return this.hatchEgg(interaction, selectedId);
        }
    },

    async handleModal(interaction) {
        // --- MODAL DE APOSTA CUSTOMIZADA ---
        if (interaction.customId.startsWith('pet_modal_bet_')) {
            const targetId = interaction.customId.replace('pet_modal_bet_', '');
            const amountRaw = interaction.fields.getTextInputValue('bet_amount');
            const amount = parseInt(amountRaw);

            if (isNaN(amount) || amount < 0) {
                return interaction.reply({ content: '❌ Valor de aposta inválido.', ephemeral: true });
            }
            
            return petBattleSystem.processDuelBet(interaction, targetId, amount);
        }

        if (interaction.customId === 'pet_modal_rename') {
            const newName = interaction.fields.getTextInputValue('new_name');
            const activePet = await db.getActivePet(interaction.user.id);
            
            if (activePet) {
                await db.updatePet(activePet.id, { name: newName });
                await interaction.reply({ content: `✅ Renomeado para **${newName}**!`, ephemeral: true });
                return this.showMainDashboard(interaction, false); 
            }
        }

        if (interaction.customId.startsWith('pet_shop_buy_modal_')) {
            const itemId = interaction.customId.replace('pet_shop_buy_modal_', '');
            const quantityRaw = interaction.fields.getTextInputValue('quantity');
            const quantity = parseInt(quantityRaw);

            if (isNaN(quantity) || quantity < 1) {
                return interaction.reply({ content: '❌ Quantidade inválida.', ephemeral: true });
            }

            const item = petItems.find(i => i.id === itemId);
            if (!item) return interaction.reply({ content: '❌ Item não encontrado.', ephemeral: true });

            const user = await db.getUser(interaction.user.id);
            const rotation = await getPetShopRotation();
            
            // Starter Egg Logic
            const isStarterEgg = !user.starterEggClaimed && item.type === 'egg' && item.id === 'ovo_comum' && quantity === 1;
            let totalCost = item.price * quantity;
            if (isStarterEgg) totalCost = 0;

            const stock = rotation.stock[item.id] || 0;

            if (user.wallet < totalCost) {
                return interaction.reply({ content: `❌ Dinheiro insuficiente. Necessário: **${totalCost}** (Você tem: ${user.wallet})`, ephemeral: true });
            }
            if (stock < quantity && stock !== 999) { // 999 = infinito (ovos)
                return interaction.reply({ content: `❌ Estoque insuficiente. Disponível: **${stock}**`, ephemeral: true });
            }

            // Realizar compra ATÔMICA
            const updateData = { 
                $inc: { 
                    wallet: -totalCost,
                    [`inventory.${item.id}`]: quantity 
                }
            };
            
            if (isStarterEgg) {
                if (!updateData.$set) updateData.$set = {};
                updateData.$set.starterEggClaimed = true;
            }

            // Se for item com estoque limitado
            if (stock !== 999) {
                rotation.stock[item.id] -= quantity;
                await db.saveGlobalConfig('petShopRotation', rotation);
            }

            // Executa update no DB
            await db.User.findOneAndUpdate({ userId: user.userId }, updateData, { new: true });

            // Adicionar ao Cofre Global
            if (totalCost > 0) {
                await db.addToVault(totalCost);
            }

            // Reduzir estoque (JÁ FEITO NA TRANSAÇÃO ACIMA, REMOVENDO LÓGICA ANTIGA)
            // if (stock !== 999) {
            //    rotation.stock[item.id] -= quantity;
            //    await db.saveGlobalConfig('petShopRotation', rotation);
            // }

            // Responder sucesso
            let successMsg = `✅ Comprou **${quantity}x ${item.name}** por **$${totalCost}**!`;
            if (isStarterEgg) successMsg += `\n🎁 **Presente de Boas-vindas**: O primeiro ovo foi GRÁTIS!`;
            
            if (item.type === 'egg') {
                successMsg += `\n\n🥚 **Atenção:** O ovo foi para o seu inventário. Vá até **Meus Ovos** e selecione-o no menu para chocar!`;
            }
            
            await interaction.reply({ content: successMsg, ephemeral: true });
        }
    }
};
