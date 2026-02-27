const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Importa o modelo User do database.js (que já inicia conexão)
const { User } = require('../database');

const MIGRATION_ITEMS = {
    'mascara_pano': 1500,
    'kit_gazuas': 5000,
    'luvas_ouro': 15000,
    'dispositivo_camuflagem': 20000,
    'cartao_acesso_vip': 30000,
    'colete_balas': 20000
};

async function migrate() {
    console.log('🔄 Iniciando migração de itens (Tools -> Consumables)...');
    
    // Espera conexão estar pronta
    if (mongoose.connection.readyState !== 1) {
        console.log('⏳ Aguardando conexão com MongoDB...');
        await new Promise(resolve => {
            if (mongoose.connection.readyState === 1) return resolve();
            mongoose.connection.once('open', resolve);
            // Timeout de segurança
            setTimeout(() => {
                if (mongoose.connection.readyState !== 1) {
                     console.log('⚠️ Timeout esperando conexão do database.js, tentando conectar manual...');
                     mongoose.connect(process.env.MONGODB_URI).then(resolve);
                }
            }, 5000);
        });
    }
    
    console.log('✅ Conectado ao MongoDB');

    try {
        const users = await User.find({});
        console.log(`👥 Encontrados ${users.length} usuários para verificar.`);

        let totalRefunded = 0;
        let usersAffected = 0;

        for (const user of users) {
            let userRefund = 0;
            let modified = false;

            if (!user.inventory) continue;

            // Tratamento para Map ou Object (caso legado)
            let inventoryKeys = [];
            if (user.inventory instanceof Map) {
                inventoryKeys = Array.from(user.inventory.keys());
            } else if (typeof user.inventory === 'object') {
                inventoryKeys = Object.keys(user.inventory);
            }

            if (inventoryKeys.length === 0) continue;

            for (const itemId of inventoryKeys) {
                if (MIGRATION_ITEMS[itemId]) {
                    let amount = 0;
                    if (user.inventory instanceof Map) {
                        amount = user.inventory.get(itemId);
                    } else {
                        amount = user.inventory[itemId];
                    }

                    if (amount > 0) {
                        const price = MIGRATION_ITEMS[itemId];
                        const refund = amount * price;

                        // Remove item
                        if (user.inventory instanceof Map) {
                            user.inventory.delete(itemId);
                        } else {
                            delete user.inventory[itemId];
                            // Se for object, precisa marcar modified
                            user.markModified('inventory');
                        }
                        
                        // Adiciona reembolso ao banco
                        user.bank = (user.bank || 0) + refund;
                        
                        userRefund += refund;
                        modified = true;
                        
                        console.log(`   User ${user.userId}: Removido ${amount}x ${itemId}. Reembolso: $${refund}`);
                    }
                }
            }

            if (modified) {
                await user.save();
                totalRefunded += userRefund;
                usersAffected++;
                // console.log(`✅ User ${user.userId} salvo. Total reembolsado: $${userRefund}`);
            }
        }

        console.log('--- RESUMO DA MIGRAÇÃO ---');
        console.log(`👥 Usuários afetados: ${usersAffected}`);
        console.log(`💰 Total reembolsado: $${totalRefunded}`);
        console.log('✅ Migração concluída com sucesso!');

    } catch (error) {
        console.error('❌ Erro durante a migração:', error);
    } finally {
        // Encerra processo após conclusão
        console.log('🔌 Encerrando script...');
        process.exit(0);
    }
}

migrate();
