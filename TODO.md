# TODO - Correção de Persistência de Jogos e Drops

## Tarefas:
- [ ] 1. Adicionar schemas no database.js para ActiveGame, ActiveDrop, ActiveGlobalDrop
- [ ] 2. Adicionar métodos de save/load/get no database.js
- [ ] 3. Modificar commands/Economia/duelo.js para usar banco de dados
- [ ] 4. Modificar commands/Economia/drop-foxies.js para usar banco de dados
- [ ] 5. Modificar commands/Economia/drop-foxies-global.js para usar banco de dados
- [ ] 6. Adicionar limpeza de dados obsoletos no index.js ao iniciar
- [ ] 7. Testar a implementação

## Detalhes dos Schemas:

### ActiveGame (Duelo)
- messageId (unique)
- hostId
- guestId
- bet
- selectedGame
- players (array)
- status (LOBBY, PLAYING, ENDED)
- gameType
- data (game state)
- turn
- createdAt
- expiresAt (for cleanup)

### ActiveDrop (Drop Local)
- messageId (unique)
- channelId
- guildId
- ownerId
- amount
- maxWinners
- participants (array)
- endTime
- createdAt

### ActiveGlobalDrop (Drop Global)
- globalDropId (unique)
- ownerId
- amount
- maxWinners
- participants (array)
- endTime
- sentMessages (array of {messageId, channelId, guildId})
- createdAt
