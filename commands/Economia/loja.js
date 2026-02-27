const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, MessageFlags } = require('discord.js');
const db = require('../../database');
const colors = require('../../colors.json');
const items = require('../../items.json');
const pets = require('../../pets.json');

// Helper para escolher item com base na raridade (Weighted Random)
function pickWeighted(pool) {
    // Pesos: comum = 60, incomum = 30, raro = 10
    const weightedPool = [];
    for (const item of pool) {
        let weight = 10; // Default
        if (item.rarity === 'comum') weight = 60;
        if (item.rarity === 'incomum') weight = 30;
        if (item.rarity === 'raro') weight = 10;
        
        for (let i = 0; i < weight; i++) {
            weightedPool.push(item);
        }
    }
    
    if (weightedPool.length === 0) return null;
    return weightedPool[Math.floor(Math.random() * weightedPool.length)];
}

// Helper para gerar rotação
async function getRotation() {
    let rotation = await db.getShopRotation();
    const now = Date.now();

    if (!rotation || rotation.nextRotation < now) {
        // Gera nova rotação
        const selectedSupplies = [];
        const selectedCollectibles = [];
        const stockMap = {}; // Mapa de estoque: { itemId: quantity }
        
        const suppliesSize = 6; // Aumentado para 6 slots de suprimentos para mais variedade
        const collectiblesSize = 2; // 2 slots de colecionáveis raros

        // Pools
        const suppliesPool = items.filter(i => i.type === 'consumable' || i.type === 'tool' || i.type === 'permanent');
        const collectiblesPool = items.filter(i => i.type === 'collectible');

        // Sorteia Suprimentos (Com pesos)
        let attempts = 0;
        while (selectedSupplies.length < suppliesSize && attempts < 200) {
            attempts++;
            if (suppliesPool.length === 0) break;
            
            const item = pickWeighted(suppliesPool);
            if (item && !selectedSupplies.includes(item.id)) {
                selectedSupplies.push(item.id);
                
                // Define estoque baseado na raridade
                if (item.rarity === 'comum') stockMap[item.id] = 50;
                else if (item.rarity === 'incomum') stockMap[item.id] = 20;
                else if (item.rarity === 'raro') stockMap[item.id] = 5;
                else stockMap[item.id] = 10;
            }
        }

        // Sorteia Colecionáveis (Sem peso específico pois todos são Raros/Caros, mas aleatório simples)
        attempts = 0;
        while (selectedCollectibles.length < collectiblesSize && attempts < 100) {
            attempts++;
            if (collectiblesPool.length === 0) break;
            const item = collectiblesPool[Math.floor(Math.random() * collectiblesPool.length)];
            if (!selectedCollectibles.includes(item.id)) {
                selectedCollectibles.push(item.id);
                stockMap[item.id] = 1; // Colecionáveis são únicos/raros na loja
            }
        }
        
        const currentHour = new Date().getHours();
        // Calcula a próxima hora par (0, 2, 4... 22, 24)
        // Se for par (ex: 10h), soma 2 -> 12h. Se for ímpar (ex: 11h), soma 1 -> 12h.
        const hoursToAdd = 2 - (currentHour % 2);
        const nextRotationDate = new Date();
        nextRotationDate.setHours(currentHour + hoursToAdd, 0, 0, 0);
        
        rotation = {
            items: [...selectedSupplies, ...selectedCollectibles], // Mantém compatibilidade com verificação de ID
            supplies: selectedSupplies,
            collectibles: selectedCollectibles,
            stock: stockMap,
            nextRotation: nextRotationDate.getTime() // Horário fixo (ex: 10:00, 12:00, 14:00)
        };
        
        await db.setShopRotation(rotation);
    }
    
    // Fallback para rotações antigas sem os campos separados ou estoque
    if (!rotation.supplies) {
        rotation.supplies = rotation.items.filter(id => {
            const item = items.find(i => i.id === id);
            return item && (item.type === 'consumable' || item.type === 'tool' || item.type === 'permanent');
        });
        rotation.collectibles = rotation.items.filter(id => {
            const item = items.find(i => i.id === id);
            return item && item.type === 'collectible';
        });
    }
    
    if (!rotation.stock) {
        rotation.stock = {};
        for (const id of rotation.items) {
            const item = items.find(i => i.id === id);
            if (item) {
                if (item.rarity === 'comum') rotation.stock[id] = 50;
                else if (item.rarity === 'incomum') rotation.stock[id] = 20;
                else if (item.rarity === 'raro') rotation.stock[id] = 5;
                else rotation.stock[id] = 10;
            }
        }
        // Salva para persistir o estoque gerado no fallback
        await db.setShopRotation(rotation);
    }
    
    return rotation;
}

// Lógica central de compra (desacoplada da UI)
async function performPurchase(userId, itemId, amount) {
    const rotation = await getRotation();
    const item = items.find(i => i.id === itemId);

    if (!item) {
        return { success: false, message: '❌ Erro interno: Item não encontrado.' };
    }
    
    // Verifica se está na rotação (Lootboxes são exceção)
    // Despertador (despertador) é sempre disponível, não entra em rotação
    const isLootbox = item.type === 'lootbox';
    const isAlwaysAvailable = itemId === 'despertador';
    if (!isLootbox && !isAlwaysAvailable && !rotation.items.includes(itemId)) {
        return { success: false, message: '❌ Este item **não está disponível** na rotação atual da loja.' };
    }

    // Lógica de Estoque e Limites
    const user = await db.getUser(userId);
    const inventory = await db.getInventory(userId);
    const isGodMode = user.hideFromRank && user.wallet > 900000000;
    
    // 1. Verifica Limite de Inventário (Novo)
    const inventoryLimit = item.inventoryLimit || Infinity;
    const currentInventory = inventory[itemId] || 0;
    
    if (!isGodMode && currentInventory + amount > inventoryLimit) {
        const canBuy = Math.max(0, inventoryLimit - currentInventory);
        return { success: false, message: `❌ Limite de inventário atingido! Você já tem **${currentInventory}/${inventoryLimit}** unidades deste item. Você só pode comprar mais **${canBuy}**.` };
    }

    let dailyLimit = item.dailyLimit || Infinity;
    
    // Reseta limites diários se necessário
    const now = new Date();
    // Gera data no formato MM/DD/YYYY para compatibilidade com Date() e fuso correto
    const brtDateString = now.toLocaleDateString('en-US', { timeZone: 'America/Sao_Paulo' });
    const today = new Date(brtDateString).setHours(0, 0, 0, 0);
    
    if (!user.lastShopReset || user.lastShopReset < today) {
        user.shopDailyLimits = {};
        user.lastShopReset = today;
        await db.updateUser(userId, { shopDailyLimits: {}, lastShopReset: today });
    }

    // Verifica limite diário
    if (!isGodMode && dailyLimit !== Infinity) {
        const currentDaily = user.shopDailyLimits.get(itemId) || 0;
        if (currentDaily + amount > dailyLimit) {
            const remaining = Math.max(0, dailyLimit - currentDaily);
            return { success: false, message: `❌ Limite diário atingido! Você só pode comprar mais **${remaining}** unidades hoje.` };
        }
    }

    // Verifica custo
    let totalCost = item.price * amount;
    let petMsg = "";

    // Check Pet Discount (Passiva N1) & Bonus Item (Passiva N10)
    const activePet = await db.getActivePet(userId);
    if (activePet && activePet.energy > 0) {
        const template = pets.find(p => p.id === activePet.petId);
        if (template) {
             const level = activePet.level || 1;
             const activePassives = [];
             if (level >= 1 && template.passive.n1) activePassives.push(template.passive.n1);
             if (level >= 5 && template.passive.n5) activePassives.push(template.passive.n5);
             if (level >= 10 && template.passive.n10) activePassives.push(template.passive.n10);

             for (const p of activePassives) {
                 // N1: Desconto
                 if (p.type === 'shop_discount') {
                     const discountVal = p.value || 0.15;
                     const discount = Math.floor(totalCost * discountVal);
                     totalCost -= discount;
                     petMsg += `\n🦜 **${activePet.name}** negociou um desconto de ${(discountVal * 100).toFixed(0)}%! (-${discount.toLocaleString()})`;
                 }
                 
                 // N10: Chance de Item Bônus na compra
                 if (p.type === 'shop_bonus_item') {
                     if (Math.random() < p.value) {
                         // Gera um item bônus (aleatório comum ou incomum)
                         const bonusPool = items.filter(i => (i.rarity === 'comum' || i.rarity === 'incomum') && i.type !== 'collectible');
                         if (bonusPool.length > 0) {
                             const bonusItem = bonusPool[Math.floor(Math.random() * bonusPool.length)];
                             // await db.addItem(userId, bonusItem.id, 1); // This call was missing from the snippet I read? No, it was there.
                             // Wait, I can't call await inside forEach if it was a forEach.
                             // It is a for..of loop (line 197), so await is fine.
                             // But I need to access db.addItem which is outside the scope?
                             // No, db is required at the top.
                             
                             // The snippet I read had:
                             // await db.addItem(userId, bonusItem.id, 1);
                             // petMsg += ...
                             
                             // I will just replace the condition and property access.
                             await db.addItem(userId, bonusItem.id, 1);
                             petMsg += `\n🎁 **${activePet.name}** conseguiu um brinde: **${bonusItem.name}**!`;
                         }
                     }
                 }
             }
        }
    }

    if (user.wallet < totalCost) {
        return { success: false, message: `❌ Fundos insuficientes. Necessário: **${totalCost.toLocaleString()}**. Você tem: **${user.wallet.toLocaleString()}**.` };
    }

    // Realiza a compra
    // Adicionar histórico de compras
    const purchaseEntry = {
        item: item.name,
        price: totalCost,
        date: Date.now()
    };
    
    // Manter apenas as últimas 10 compras para economizar espaço
    const currentHistory = user.purchaseHistory || [];
    currentHistory.push(purchaseEntry);
    if (currentHistory.length > 10) currentHistory.shift();

    await db.updateUser(userId, {
        wallet: user.wallet - totalCost,
        purchaseHistory: currentHistory
    });

    // Enviar para o cofre global
    await db.addToVault(totalCost, userId);

    await db.addItem(userId, itemId, amount);
    
    // Atualiza limite diário se aplicável
    if (dailyLimit !== Infinity) {
        const currentDaily = user.shopDailyLimits.get(itemId) || 0;
        user.shopDailyLimits.set(itemId, currentDaily + amount);
        await db.updateUser(userId, { shopDailyLimits: user.shopDailyLimits });
    }

    // Nota: Estoque global da rotação NÃO é decrementado, pois é infinito para todos.
    // A rotação apenas define QUAIS itens aparecem.

    return { 
        success: true, 
        message: `Compra realizada com sucesso!${petMsg}`,
        data: {
            itemName: item.name,
            amount: amount,
            totalCost: totalCost,
            newWallet: user.wallet - totalCost,
            newStock: dailyLimit === Infinity ? 'Infinito' : `${dailyLimit - (user.shopDailyLimits.get(itemId) || 0)}/${dailyLimit}`,
            petMsg: petMsg
        }
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loja')
        .setDescription('Acesse a loja de suprimentos da FOXHOUND')
        .addStringOption(option => 
            option.setName('item')
                .setDescription('O ID do item para comprar diretamente (opcional)')
                .setAutocomplete(true)
        )
        .addIntegerOption(option => 
            option.setName('quantidade')
                .setDescription('Quantidade a comprar (Padrão: 1)')
                .setMinValue(1)
        ),

    async execute(interaction) {
        // Atualiza o último canal de economia usado
        await db.updateLastEconomyChannel(interaction.guild.id, interaction.channel.id);

        const itemId = interaction.options.getString('item');
        const amount = interaction.options.getInteger('quantidade') || 1;

        if (itemId) {
            // Compra direta via comando
            const item = items.find(i => i.id === itemId);
            if (!item) return interaction.reply({ content: '❌ Item não encontrado.', ephemeral: true });

            const totalCost = item.price * amount;

            if (totalCost >= 50000) {
                const confirmEmbed = new EmbedBuilder()
                    .setTitle('⚠️ Compra de Alto Valor')
                    .setDescription(`Você está prestes a comprar **${amount}x ${item.name}** por **${totalCost.toLocaleString()} Foxies**.\nDeseja confirmar a transação?`)
                    .setColor(colors.warning);

                const confirmRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('confirm_buy').setLabel('Confirmar Compra').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('cancel_buy').setLabel('Cancelar').setStyle(ButtonStyle.Danger)
                );

                const response = await interaction.reply({
                    embeds: [confirmEmbed],
                    components: [confirmRow],
                    ephemeral: true,
                    fetchReply: true
                });

                const collector = response.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    time: 30000
                });

                collector.on('collect', async i => {
                    if (i.customId === 'confirm_buy') {
                        await i.deferUpdate();
                        const result = await performPurchase(interaction.user.id, itemId, amount);
                        
                        if (!result.success) {
                            return i.followUp({ content: result.message, ephemeral: true });
                        }

                        const embed = new EmbedBuilder()
                            .setTitle('🛒 Compra Realizada')
                            .setDescription(`Você adquiriu **${result.data.amount}x ${result.data.itemName}** por **${result.data.totalCost.toLocaleString()}** Foxies.${result.data.petMsg || ''}`)
                            .addFields(
                                { name: 'Saldo Restante', value: `${result.data.newWallet.toLocaleString()} Foxies` },
                                { name: 'Estoque Restante', value: `${result.data.newStock} unidades` }
                            )
                            .setColor(colors.success);

                        await i.editReply({ content: null, embeds: [embed], components: [] });
                    } else if (i.customId === 'cancel_buy') {
                        await i.update({ content: '❌ Compra cancelada.', embeds: [], components: [] });
                    }
                });

                collector.on('end', (collected, reason) => {
                    if (reason === 'time') {
                        interaction.editReply({ content: '⏱️ Tempo esgotado.', components: [] }).catch(() => {});
                    }
                });
                return;
            }

            const result = await performPurchase(interaction.user.id, itemId, amount);
            
            if (!result.success) {
                return interaction.reply({ content: result.message, flags: MessageFlags.Ephemeral });
            }

            const embed = new EmbedBuilder()
                .setTitle('🛒 Compra Realizada')
                .setDescription(`Você adquiriu **${result.data.amount}x ${result.data.itemName}** por **${result.data.totalCost.toLocaleString()}** Foxies.${result.data.petMsg || ''}`)
                .addFields(
                    { name: 'Saldo Restante', value: `${result.data.newWallet.toLocaleString()} Foxies` },
                    { name: 'Estoque Restante', value: `${result.data.newStock} unidades` }
                )
                .setColor(colors.success);

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        // Abre interface interativa
        await this.showShop(interaction);
    },

    async executePrefix(message, args) {
        // f!loja
        if (!args.length || args[0] === 'ver' || args[0] === 'menu') {
            return await this.showShop(message);
        }

        // f!loja comprar <item> [qtd]
        if (args[0] === 'comprar') {
            const itemId = args[1];
            const amount = parseInt(args[2]) || 1;

            if (!itemId) return message.reply('❌ Especifique o ID do item.');
            
            const item = items.find(i => i.id === itemId);
            if (!item) return message.reply('❌ Item não encontrado.');

            const totalCost = item.price * amount;

            if (totalCost >= 50000) {
                const confirmEmbed = new EmbedBuilder()
                    .setTitle('⚠️ Compra de Alto Valor')
                    .setDescription(`Você está prestes a comprar **${amount}x ${item.name}** por **${totalCost.toLocaleString()} Foxies**.\nDeseja confirmar a transação?`)
                    .setColor(colors.warning);

                const confirmRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('confirm_buy_prefix').setLabel('Confirmar').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('cancel_buy_prefix').setLabel('Cancelar').setStyle(ButtonStyle.Danger)
                );

                const confirmMsg = await message.reply({
                    embeds: [confirmEmbed],
                    components: [confirmRow]
                });

                const collector = confirmMsg.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    time: 30000
                });

                collector.on('collect', async i => {
                    if (i.user.id !== message.author.id) {
                        return i.reply({ content: '❌ Sai fora, isso não é pra você.', ephemeral: true });
                    }

                    if (i.customId === 'confirm_buy_prefix') {
                        await i.deferUpdate();
                        const result = await performPurchase(message.author.id, itemId, amount);
                        
                        if (!result.success) {
                            return i.editReply({ content: result.message, embeds: [], components: [] });
                        }

                        const embed = new EmbedBuilder()
                            .setTitle('🛒 Compra Realizada')
                            .setDescription(`Você adquiriu **${result.data.amount}x ${result.data.itemName}** por **${result.data.totalCost.toLocaleString()}** Foxies.${result.data.petMsg || ''}`)
                            .setColor(colors.success);

                        await i.editReply({ content: null, embeds: [embed], components: [] });
                    } else if (i.customId === 'cancel_buy_prefix') {
                        await i.update({ content: '❌ Compra cancelada.', embeds: [], components: [] });
                    }
                });

                collector.on('end', (collected, reason) => {
                    if (reason === 'time') {
                        confirmMsg.edit({ content: '⏱️ Tempo esgotado.', components: [] }).catch(() => {});
                    }
                });
                return;
            }

            const result = await performPurchase(message.author.id, itemId, amount);
            if (!result.success) return message.reply(result.message);

            const embed = new EmbedBuilder()
                .setTitle('🛒 Compra Realizada')
                .setDescription(`Você adquiriu **${result.data.amount}x ${result.data.itemName}** por **${result.data.totalCost.toLocaleString()}** Foxies.${result.data.petMsg || ''}`)
                .setColor(colors.success);
            
            return message.reply({ embeds: [embed] });
        }

        // f!loja <item> [qtd] (Atalho)
        const itemId = args[0];
        const amount = parseInt(args[1]) || 1;
        const item = items.find(i => i.id === itemId);

        if (item) {
            const result = await performPurchase(message.author.id, itemId, amount);
            if (!result.success) return message.reply(result.message);
            
            const embed = new EmbedBuilder()
                .setTitle('🛒 Compra Realizada')
                .setDescription(`Você adquiriu **${result.data.amount}x ${result.data.itemName}** por **${result.data.totalCost.toLocaleString()}** Foxies.`)
                .setColor(colors.success);
            
            return message.reply({ embeds: [embed] });
        }

        return message.reply('❌ Comando inválido. Use `f!loja` para abrir o menu.');
    },

    async showShop(target) {
        const userId = target.user ? target.user.id : target.author.id;
        const rotation = await getRotation();
        const nextUpdate = Math.floor(rotation.nextRotation / 1000);

        // Busca dados do usuário para verificar limites
        const user = await db.getUser(userId);

        // Estado local da navegação
        let currentRarity = null;
        let currentItemId = null;

        // Helpers de Renderização
        const getRarityEmoji = (rarity, type) => {
            if (type === 'lootbox') return '📦';
            if (type === 'collectible') return '💎';
            if (rarity === 'comum') return '⬜';
            if (rarity === 'incomum') return '🟦';
            if (rarity === 'raro') return '🟨';
            return '⬜';
        };

        const getStockStatus = (item) => {
            // Mostra limite diário E limite de inventário se relevante
            const dailyLimit = item.dailyLimit || Infinity;
            const invLimit = item.inventoryLimit || Infinity;
            
            let status = "";
            
            if (dailyLimit !== Infinity) {
                const currentDaily = user.shopDailyLimits ? (user.shopDailyLimits.get(item.id) || 0) : 0;
                const remaining = Math.max(0, dailyLimit - currentDaily);
                status += `Loja: ${remaining}/${dailyLimit}`;
            } else {
                status += "Loja: Infinito";
            }
            
            if (invLimit !== Infinity) {
                // Nota: inventory não está disponível aqui no escopo, mas podemos buscar se necessário ou simplificar
                // Como renderItem busca user de novo, podemos assumir que para renderCategory simplificamos
                status += ` | Max Inv: ${invLimit}`;
            }
            
            return status;
        };

        const getItemTypeLabel = (type) => {
            if (['consumable', 'lootbox'].includes(type)) return '⚡ Consumível';
            return '♾️ Permanente';
        };

        const renderHome = () => {
            const diff = rotation.nextRotation - Date.now();
            const hours = Math.floor(diff / 3600000);
            const minutes = Math.floor((diff % 3600000) / 60000);
            const timeString = `${hours}h ${minutes}m`;

            const embed = new EmbedBuilder()
                .setTitle('🛒 Loja de Suprimentos Táticos')
                .setColor(colors.default)
                .setDescription(`Bem-vindo à loja da FOXHOUND.\nEquipamentos renovados a cada 2 horas.\n\n**Próxima Rotação:** <t:${nextUpdate}:t> (Faltam ${timeString})\n\n⬇️ **Selecione uma categoria abaixo para ver os itens.**`)
                .setFooter({ text: 'Sistema Unificado de Compras' });

            const menu = new StringSelectMenuBuilder()
                .setCustomId('shop_rarity_select')
                .setPlaceholder('Selecione uma categoria')
                .addOptions(
                    { label: 'Lootboxes', description: 'Caixas com recompensas aleatórias', value: 'lootbox', emoji: '📦' },
                    { label: 'Comum', description: 'Itens básicos e essenciais', value: 'comum', emoji: '⬜' },
                    { label: 'Incomum', description: 'Equipamentos táticos melhorados', value: 'incomum', emoji: '🟦' },
                    { label: 'Raro', description: 'Tecnologia de ponta', value: 'raro', emoji: '🟨' },
                    { label: 'Colecionável', description: 'Itens exclusivos', value: 'collectible', emoji: '💎' }
                );

            return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
        };

        const renderCategory = async (rarity) => {
            // Atualiza usuário para garantir dados recentes
            const updatedUser = await db.getUser(userId);
            if (updatedUser.shopDailyLimits) user.shopDailyLimits = updatedUser.shopDailyLimits;

            // Busca pet ativo para calcular descontos visuais
            const activePet = await db.getActivePet(userId);
            const getPriceDisplay = (basePrice) => {
                let price = basePrice;
                if (activePet && activePet.energy > 0) {
                    const template = pets.find(p => p.id === activePet.petId);
                    if (template) {
                        const level = activePet.level || 1;
                        if (level >= 1 && template.passive.n1 && template.passive.n1.type === 'shop_discount') {
                             const discountVal = template.passive.n1.value || 0.15;
                             const discount = Math.floor(basePrice * discountVal);
                             const finalPrice = basePrice - discount;
                             return `💰 ~~${basePrice.toLocaleString()}~~ **${finalPrice.toLocaleString()}** 📉`;
                        }
                    }
                }
                return `💰 ${basePrice.toLocaleString()}`;
            };

            const embed = new EmbedBuilder()
                .setTitle(`📂 Categoria: ${rarity.toUpperCase()}`)
                .setColor(colors.default)
                .setFooter({ text: `Próxima Rotação: ${new Date(rotation.nextRotation).toLocaleTimeString('pt-BR')}` });

            // Despertador é sempre disponível, não entra em rotação
            const rotationItems = [...rotation.supplies, ...rotation.collectibles, 'despertador'];
            let filteredItems = [];

            if (rarity === 'lootbox') {
                filteredItems = items.filter(i => i.type === 'lootbox');
            } else if (rarity === 'collectible') {
                filteredItems = items.filter(i => rotationItems.includes(i.id) && i.type === 'collectible');
            } else {
                filteredItems = items.filter(i => rotationItems.includes(i.id) && i.rarity === rarity && i.type !== 'collectible' && i.type !== 'lootbox');
            }

            // Garante que não haja duplicatas no menu de seleção e limita a 25 itens
            filteredItems = [...new Map(filteredItems.map(item => [item.id, item])).values()];
            
            // Defesa extra contra duplicatas de ID e limite do Discord
            const uniqueOptions = [];
            const seenIds = new Set();
            
            for (const item of filteredItems) {
                if (!seenIds.has(item.id)) {
                    seenIds.add(item.id);
                    uniqueOptions.push({
                        label: item.name.substring(0, 100), // Garante limite de caracteres
                        description: `${getPriceDisplay(item.price).replace('💰 ', '💰')} | 📦 ${getStockStatus(item)} | ${getItemTypeLabel(item.type)}`.substring(0, 100),
                        value: item.id,
                        emoji: getRarityEmoji(item.rarity, item.type)
                    });
                }
            }

            if (filteredItems.length === 0) {
                embed.setDescription('🚫 **Nenhum item disponível nesta categoria hoje.**');
                const backBtn = new ButtonBuilder().setCustomId('shop_back_home').setLabel('Voltar').setStyle(ButtonStyle.Secondary);
                return { embeds: [embed], components: [new ActionRowBuilder().addComponents(backBtn)] };
            }

            // Lista de itens no Embed (Exibe todos, mas menu limita a 25)
            const itemsList = filteredItems.map(i => {
                const stock = getStockStatus(i);
                const desc = i.description ? `\n*${i.description}*` : '';
                return `**${i.name}**${desc}\n${getPriceDisplay(i.price)} | 📦 ${stock} | ${getItemTypeLabel(i.type)}`;
            }).join('\n\n');
            
            embed.setDescription(`Selecione um item no menu abaixo para ver detalhes e comprar.\n\n${itemsList}`);

            // Select Menu de Itens
            const itemMenu = new StringSelectMenuBuilder()
                .setCustomId('shop_item_select')
                .setPlaceholder('Escolha um item para comprar')
                .addOptions(uniqueOptions.slice(0, 25)); // Limite rígido do Discord

            const backBtn = new ButtonBuilder().setCustomId('shop_back_home').setLabel('Voltar').setStyle(ButtonStyle.Secondary);

            return { 
                embeds: [embed], 
                components: [
                    new ActionRowBuilder().addComponents(itemMenu),
                    new ActionRowBuilder().addComponents(backBtn)
                ] 
            };
        };

        const renderItem = async (itemId) => {
            // Atualiza usuário para garantir dados recentes
            const updatedUser = await db.getUser(userId);
            if (updatedUser.shopDailyLimits) user.shopDailyLimits = updatedUser.shopDailyLimits;

            const item = items.find(i => i.id === itemId);
            const stockDisplay = getStockStatus(item);
            
            // Check real availability for button
            const dailyLimit = item.dailyLimit || Infinity;
            const currentDaily = user.shopDailyLimits ? (user.shopDailyLimits.get(itemId) || 0) : 0;
            const isOutOfStock = dailyLimit !== Infinity && currentDaily >= dailyLimit;

            const embed = new EmbedBuilder()
                .setTitle(`${getRarityEmoji(item.rarity, item.type)} ${item.name}`)
                .setColor(colors.default)
                .setDescription(item.description || 'Sem descrição.')
                .addFields(
                    { name: '💰 Preço', value: `${item.price.toLocaleString()} Foxies`, inline: true },
                    { name: '📦 Estoque', value: `${stockDisplay}`, inline: true },
                    { name: '🆔 ID', value: `\`${item.id}\``, inline: true }
                );


            const buyBtn = new ButtonBuilder()
                .setCustomId('shop_buy_btn')
                .setLabel(isOutOfStock ? 'Esgotado (Hoje)' : 'Comprar')
                .setStyle(isOutOfStock ? ButtonStyle.Danger : ButtonStyle.Success)
                .setEmoji('🛒')
                .setDisabled(isOutOfStock);

            const backBtn = new ButtonBuilder()
                .setCustomId('shop_back_category')
                .setLabel('Voltar')
                .setStyle(ButtonStyle.Secondary);

            return { 
                embeds: [embed], 
                components: [new ActionRowBuilder().addComponents(buyBtn, backBtn)] 
            };
        };

        // Envio Inicial
        let message;
        const initialPayload = renderHome();
        
        if (target.reply) {
            message = await target.reply({ ...initialPayload, fetchReply: true, ephemeral: true });
        } else {
            message = await target.channel.send(initialPayload);
        }

        // Collector
        const collector = message.createMessageComponentCollector({ 
            filter: i => i.user.id === userId, 
            time: 300000 // 5 minutos de inatividade
        });

        collector.on('collect', async i => {
            try {
                // Navegação
                if (i.customId === 'shop_rarity_select') {
                    currentRarity = i.values[0];
                    await i.update(await renderCategory(currentRarity));
                }
                else if (i.customId === 'shop_item_select') {
                    currentItemId = i.values[0];
                    await i.update(await renderItem(currentItemId));
                }
                else if (i.customId === 'shop_back_home') {
                    currentRarity = null;
                    currentItemId = null;
                    await i.update(renderHome());
                }
                else if (i.customId === 'shop_back_category') {
                    currentItemId = null;
                    await i.update(await renderCategory(currentRarity));
                }
                // Ação de Compra (Modal)
                else if (i.customId === 'shop_buy_btn') {
                    const item = items.find(it => it.id === currentItemId);
                    
                    const modal = new ModalBuilder()
                        .setCustomId(`shop_buy_modal_${currentItemId}`)
                        .setTitle(`Comprar: ${item.name}`);

                    const inputAmount = new TextInputBuilder()
                        .setCustomId('amount')
                        .setLabel('Quantidade')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Ex: 1')
                        .setRequired(true)
                        .setValue('1');

                    const actionRow = new ActionRowBuilder().addComponents(inputAmount);
                    modal.addComponents(actionRow);

                    await i.showModal(modal);
                    
                    // Aguarda submissão do modal
                    const submitted = await i.awaitModalSubmit({
                        filter: m => m.customId === `shop_buy_modal_${currentItemId}` && m.user.id === userId,
                        time: 60000
                    }).catch(() => null);

                    if (submitted) {
                        const qtd = parseInt(submitted.fields.getTextInputValue('amount'));
                        
                        if (isNaN(qtd) || qtd < 1) {
                            await submitted.reply({ content: '❌ Quantidade inválida.', flags: MessageFlags.Ephemeral });
                            return;
                        }

                        // Check High Value
                        const totalCost = item.price * qtd;
                        if (totalCost >= 50000) {
                            const confirmEmbed = new EmbedBuilder()
                                .setTitle('⚠️ Compra de Alto Valor')
                                .setDescription(`Você está prestes a comprar **${qtd}x ${item.name}** por **${totalCost.toLocaleString()} Foxies**.\nDeseja confirmar a transação?`)
                                .setColor(colors.warning);

                            const confirmRow = new ActionRowBuilder().addComponents(
                                new ButtonBuilder().setCustomId('confirm_buy_modal').setLabel('Confirmar').setStyle(ButtonStyle.Success),
                                new ButtonBuilder().setCustomId('cancel_buy_modal').setLabel('Cancelar').setStyle(ButtonStyle.Danger)
                            );

                            const confirmMsg = await submitted.reply({
                                embeds: [confirmEmbed],
                                components: [confirmRow],
                                ephemeral: true,
                                fetchReply: true
                            });

                            const confirmCollector = confirmMsg.createMessageComponentCollector({
                                componentType: ComponentType.Button,
                                time: 30000
                            });

                            confirmCollector.on('collect', async i => {
                                if (i.customId === 'confirm_buy_modal') {
                                    await i.deferUpdate();
                                    const result = await performPurchase(userId, currentItemId, qtd);

                                    if (result.success) {
                                        await i.editReply({ 
                                            content: `✅ **Sucesso!** Comprou ${qtd}x ${item.name}.`,
                                            embeds: [],
                                            components: [] 
                                        });
                                        // Atualiza embed do item principal
                                        await message.edit(await renderItem(currentItemId));
                                    } else {
                                        await i.editReply({ content: result.message, embeds: [], components: [] });
                                    }
                                } else {
                                    await i.update({ content: '❌ Compra cancelada.', embeds: [], components: [] });
                                }
                            });
                            return;
                        }

                        // Processa compra normal
                        const result = await performPurchase(userId, currentItemId, qtd);

                        if (result.success) {
                            // Atualiza UI com novo estoque (re-renderiza o item)
                            await submitted.reply({ 
                                content: `✅ **Sucesso!** Comprou ${qtd}x ${item.name}.`,
                                flags: MessageFlags.Ephemeral 
                            });
                            
                            // Atualiza embed do item para refletir estoque novo
                            await message.edit(await renderItem(currentItemId));
                        } else {
                            await submitted.reply({ content: result.message, flags: MessageFlags.Ephemeral });
                        }
                    }
                }
            } catch (err) {
                console.error('Erro no collector da loja:', err);
                // Tenta responder se ainda não respondeu
                if (!i.replied && !i.deferred) {
                    await i.reply({ content: '❌ Ocorreu um erro na interação.', flags: MessageFlags.Ephemeral });
                }
            }
        });

        collector.on('end', () => {
            // Remove componentes ao expirar
            if (message.editable) {
                message.edit({ components: [] }).catch(() => {});
            }
        });
    }
};
