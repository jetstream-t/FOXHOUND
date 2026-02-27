const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const colors = require('../../colors.json');
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('filme')
    .setDescription('Comandos de filmes')
    .addSubcommand(subcommand =>
      subcommand
        .setName('aleatório')
        .setDescription('Mostra um filme aleatório')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('buscar')
        .setDescription('Busca um filme específico')
        .addStringOption(option =>
          option
            .setName('nome')
            .setDescription('Nome do filme para buscar')
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    if (!focusedValue) return interaction.respond([]);

    try {
      const response = await fetch(`${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(focusedValue)}&language=pt-BR`);
      const data = await response.json();

      if (!data.results) return interaction.respond([]);

      const choices = data.results.slice(0, 25).map(movie => ({
        name: `${movie.title} (${movie.release_date ? movie.release_date.split('-')[0] : 'N/A'})`,
        value: movie.id.toString(),
      }));

      await interaction.respond(choices);
    } catch (error) {
      console.error('Erro no autocomplete de filmes:', error);
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey || apiKey === 'SUA_CHAVE_TMDB_AQUI' || apiKey.trim() === '') {
      return interaction.reply({ content: '❌ A API Key do TMDB não foi configurada corretamente no arquivo .env.', flags: 64 });
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      await interaction.deferReply();
    } catch (err) {
      return;
    }

    try {
      let movie;

      if (subcommand === 'aleatório') {
        const randomPage = Math.floor(Math.random() * 500) + 1;
        const response = await fetch(`${TMDB_BASE_URL}/movie/popular?api_key=${apiKey}&language=pt-BR&page=${randomPage}`);
        const data = await response.json();

        if (!data.results || data.results.length === 0) {
          return interaction.editReply('Não foi possível encontrar um filme aleatório no momento.');
        }

        const randomIndex = Math.floor(Math.random() * data.results.length);
        const basicMovie = data.results[randomIndex];
        
        const detailsResponse = await fetch(`${TMDB_BASE_URL}/movie/${basicMovie.id}?api_key=${apiKey}&language=pt-BR&append_to_response=external_ids`);
        movie = await detailsResponse.json();
      } else if (subcommand === 'buscar') {
        const movieId = interaction.options.getString('nome');
        let finalMovieId = movieId;

        if (isNaN(movieId)) {
          const searchResponse = await fetch(`${TMDB_BASE_URL}/search/movie?api_key=${apiKey}&query=${encodeURIComponent(movieId)}&language=pt-BR`);
          const searchData = await searchResponse.json();
          if (!searchData.results || searchData.results.length === 0) {
            return interaction.editReply(`Nenhum filme encontrado para "${movieId}".`);
          }
          finalMovieId = searchData.results[0].id;
        }

        const detailsResponse = await fetch(`${TMDB_BASE_URL}/movie/${finalMovieId}?api_key=${apiKey}&language=pt-BR&append_to_response=external_ids`);
        movie = await detailsResponse.json();
      }

      if (!movie || movie.success === false) {
        return interaction.editReply('Filme não encontrado.');
      }

      const imdbId = movie.external_ids?.imdb_id;
      const imdbLink = imdbId ? `[Ver no IMDb](https://www.imdb.com/title/${imdbId})` : '';

      const embed = new EmbedBuilder()
        .setTitle(movie.title)
        .setDescription((movie.overview || 'Sinopse não disponível em português.') + (imdbLink ? `\n\n🔗 ${imdbLink}` : ''))
        .setColor(colors.default)
        .addFields(
          { name: '📅 Data de Lançamento', value: movie.release_date ? movie.release_date.split('-').reverse().join('/') : 'N/A', inline: true },
          { name: '⭐ Nota', value: movie.vote_average ? `${movie.vote_average.toFixed(1)}/10` : 'N/A', inline: true }
        )
        .setThumbnail(movie.poster_path ? `${TMDB_IMAGE_BASE_URL}${movie.poster_path}` : null)
        .setImage(movie.backdrop_path ? `${TMDB_IMAGE_BASE_URL}${movie.backdrop_path}` : (movie.poster_path ? `${TMDB_IMAGE_BASE_URL}${movie.poster_path}` : null))
        .setFooter({ text: 'Dados providos por TMDB' });

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('Erro ao buscar filme:', error);
      await interaction.editReply('Ocorreu um erro ao processar o comando.');
    }
  },

  async executePrefix(message, args) {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey || apiKey === 'SUA_CHAVE_TMDB_AQUI' || apiKey.trim() === '') {
      return message.reply('❌ A API Key do TMDB não foi configurada no arquivo .env.');
    }

    const sub = args[0]?.toLowerCase();
    
    try {
      let movie;
      if (sub === 'aleatório' || !sub) {
        const randomPage = Math.floor(Math.random() * 500) + 1;
        const response = await fetch(`${TMDB_BASE_URL}/movie/popular?api_key=${apiKey}&language=pt-BR&page=${randomPage}`);
        const data = await response.json();
        if (!data.results || data.results.length === 0) return message.reply('❌ Não encontrei filmes.');
        const randomIndex = Math.floor(Math.random() * data.results.length);
        const detailsResponse = await fetch(`${TMDB_BASE_URL}/movie/${data.results[randomIndex].id}?api_key=${apiKey}&language=pt-BR&append_to_response=external_ids`);
        movie = await detailsResponse.json();
      } else {
        const query = sub === 'buscar' ? args.slice(1).join(' ') : args.join(' ');
        if (!query) return message.reply('❌ Use `f!filme buscar <nome>` ou `f!filme aleatório`.');
        const searchResponse = await fetch(`${TMDB_BASE_URL}/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=pt-BR`);
        const searchData = await searchResponse.json();
        if (!searchData.results || searchData.results.length === 0) return message.reply(`❌ Nenhum filme encontrado para "${query}".`);
        const detailsResponse = await fetch(`${TMDB_BASE_URL}/movie/${searchData.results[0].id}?api_key=${apiKey}&language=pt-BR&append_to_response=external_ids`);
        movie = await detailsResponse.json();
      }

      if (!movie || movie.success === false) return message.reply('❌ Filme não encontrado.');

      const imdbId = movie.external_ids?.imdb_id;
      const embed = new EmbedBuilder()
        .setTitle(movie.title)
        .setDescription((movie.overview || 'Sinopse não disponível.') + (imdbId ? `\n\n🔗 [Ver no IMDb](https://www.imdb.com/title/${imdbId})` : ''))
        .setColor(colors.default)
        .addFields(
          { name: '📅 Lançamento', value: movie.release_date ? movie.release_date.split('-').reverse().join('/') : 'N/A', inline: true },
          { name: '⭐ Nota', value: movie.vote_average ? `${movie.vote_average.toFixed(1)}/10` : 'N/A', inline: true }
        )
        .setThumbnail(movie.poster_path ? `${TMDB_IMAGE_BASE_URL}${movie.poster_path}` : null)
        .setImage(movie.backdrop_path ? `${TMDB_IMAGE_BASE_URL}${movie.backdrop_path}` : null)
        .setFooter({ text: 'Dados por TMDB' });

      await message.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Erro no prefixo filme:', error);
      message.reply('❌ Ocorreu um erro ao buscar o filme.');
    }
  }
};
