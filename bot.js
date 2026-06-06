const { Client, GatewayIntentBits, AuditLogEvent, SlashCommandBuilder, REST, Routes, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice'); 

// === CONFIGURAÇÕES ===
const TOKEN = 'MTQ1OTMxOTM3MDc4NTQ5Mjk5Mg.G7ZLcr.g5ma7FmlDZ2oZhcKAvy1bgG-JEvx7WrvjfGAMU'; 
const CLIENT_ID = '1459319370785492992'; 
const CARGO_AUTORIZADO_ID = '1511518352429023332'; // ESTRELINHA (PODE DAR CARGO)
const CARGO_TAXADO_ID = '1511518418497568849';
const CARGO_MOD_ID = '1503177104307523729';
const CARGO_BACKUP_PERM_ID = '1511525992475394193';

const CARGO_INTOCAVEL_PROTEGIDO = '1511518354702336040';

const VIPS_CONFIG = {
    good: { role: '1503550418704273509', category: '1503177165829570690', name: 'Good' },
    suprime: { role: '1503177069880672426', category: '1503177168618782830', name: 'Suprime' },
    lost: { role: '1503177088092471396', category: '1503177203813453854', name: 'Lost' }
};

const backupCargos = new Map();
const usuariosMutados = new Set();
const vipsPendentes = new Map();
const cargoCallDono = new Map();
const coleiras = new Map(); 

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildVoiceStates
    ]
});

// 1. REGISTRO DE COMANDOS
const commands = [
    new SlashCommandBuilder().setName('backup').setDescription('Restaura cargos de um usuário taxado.').addUserOption(o => o.setName('usuario').setDescription('Alvo').setRequired(true)),
    new SlashCommandBuilder().setName('castigo').setDescription('Aplica timeout.').addUserOption(o => o.setName('usuario').setDescription('Alvo').setRequired(true)).addIntegerOption(o => o.setName('tempo').setDescription('Minutos').setRequired(true)).addStringOption(o => o.setName('motivo').setDescription('Motivo')),
    new SlashCommandBuilder().setName('ban').setDescription('Bane o usuário.').addUserOption(o => o.setName('usuario').setDescription('Alvo').setRequired(true)).addStringOption(o => o.setName('motivo').setDescription('Motivo')),
    new SlashCommandBuilder().setName('mutarcall').setDescription('Muta na call.').addUserOption(o => o.setName('usuario').setDescription('Alvo').setRequired(true)).addIntegerOption(o => o.setName('tempo').setDescription('Minutos').setRequired(true)).addStringOption(o => o.setName('motivo').setDescription('Motivo')),
    new SlashCommandBuilder().setName('desmutarcall').setDescription('Remove o mute.').addUserOption(o => o.setName('usuario').setDescription('Alvo').setRequired(true)),
    new SlashCommandBuilder().setName('addvip').setDescription('Autoriza um VIP.').addUserOption(o => o.setName('usuario').setDescription('Alvo').setRequired(true))
        .addStringOption(o => o.setName('tipo').setDescription('Tipo do VIP').setRequired(true).addChoices({ name: 'Good', value: 'good' }, { name: 'Suprime', value: 'suprime' }, { name: 'Lost', value: 'lost' })),
    new SlashCommandBuilder().setName('ativarvip').setDescription('Ativa seu VIP pendente.'),
    new SlashCommandBuilder().setName('addpessoa').setDescription('Adiciona amigo na sua tag VIP.').addUserOption(o => o.setName('usuario').setDescription('Amigo').setRequired(true)),
    new SlashCommandBuilder().setName('nometag').setDescription('Altera o nome da sua tag VIP.').addStringOption(o => o.setName('nome').setDescription('Novo nome').setRequired(true)),
    
    // Comando por chat: /rodar [usuario]
    new SlashCommandBuilder().setName('rodar').setDescription('Move uma pessoa por várias calls sem parar por 5 minutos.').addUserOption(o => o.setName('usuario').setDescription('Pessoa que vai rodar').setRequired(true)),
    
    // NOVO COMANDO POR CHAT: /coleira [usuario]
    new SlashCommandBuilder().setName('coleira').setDescription('Prende uma pessoa na sua call de voz por 5 minutos.').addUserOption(o => o.setName('usuario').setDescription('Pessoa para colocar na coleira').setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
    try { await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands }); console.log('🛡️ Bot Online: Proteção por Cargo Estrelinha Ativa!'); } catch (e) { console.error(e); }
})();

// 🟡 LÓGICA DE REVERSO E ANTI-CARGO
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    const botMember = newMember.guild.members.me;
    const temCargoIntocavel = newMember.roles.cache.has(CARGO_INTOCAVEL_PROTEGIDO);

    // --- REVERSO DE CASTIGO ---
    const foiCastigado = !oldMember.communicationDisabledUntilTimestamp && newMember.communicationDisabledUntilTimestamp;
    if (foiCastigado && temCargoIntocavel) {
        try {
            await new Promise(r => setTimeout(r, 500));
            const logs = await newMember.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberUpdate });
            const log = logs.entries.first();
            if (log && log.target.id === newMember.id) {
                const executor = await newMember.guild.members.fetch(log.executor.id).catch(() => null);
                if (!executor || log.executor.bot) return;

                if (log.executor.id !== newMember.guild.ownerId && executor.roles.highest.position <= botMember.roles.highest.position) {
                    await newMember.timeout(null, 'Reverso: Alvo Intocável');
                    await executor.timeout(600000, `Reverso: Tentou castigar um Intocável.`);
                }
            }
        } catch (e) {}
        return;
    }

    // --- ANTI-CARGO (PROTEÇÃO ESTRELINHA) ---
    const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
    const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));

    if (addedRoles.size === 0 && removedRoles.size === 0) return;

    try {
        await new Promise(r => setTimeout(r, 800));
        const roleLogs = await newMember.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberRoleUpdate });
        const rLog = roleLogs.entries.first();
        if (!rLog || rLog.target.id !== newMember.id || rLog.executor.id === client.user.id) return;

        const infrator = await newMember.guild.members.fetch(rLog.executor.id).catch(() => null);
        if (!infrator || rLog.executor.bot) return;

        const eDono = rLog.executor.id === newMember.guild.ownerId;
        const eSuperiorAoBot = infrator.roles.highest.position > botMember.roles.highest.position;
        const temEstrelinha = infrator.roles.cache.has(CARGO_AUTORIZADO_ID);

        if (!eDono && !eSuperiorAoBot && !temEstrelinha) {
            backupCargos.set(infrator.id, infrator.roles.cache.map(r => r.id));
            await newMember.roles.set(oldMember.roles.cache.map(r => r.id), 'Anti-Cargo: Sem permission Estrelinha.');
            await infrator.roles.set([CARGO_TAXADO_ID]);
        }
    } catch (e) {}
});

// 🔵 INTERAÇÕES (COMANDOS)
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { member, guild, user, commandName, options } = interaction;
    const eDono = user.id === guild.ownerId || member.roles.cache.has(CARGO_INTOCAVEL_PROTEGIDO);
    const eHigher = member.roles.highest.position > guild.members.me.roles.highest.position;
    const alvo = options.getMember('usuario');

    // COMANDO POR CHAT: /coleira [usuario]
    if (commandName === 'coleira') {
        const callDoMestre = member.voice.channel; // A sua call de voz atual

        if (!callDoMestre) {
            return interaction.reply({ content: '❌ Você precisa estar conectado em uma call de voz para prender alguém na coleira!', ephemeral: true });
        }
        if (!alvo?.voice?.channel) {
            return interaction.reply({ content: `❌ O usuário **${alvo?.user?.username || 'Alvo'}** precisa estar conectado em alguma call para ser puxado!`, ephemeral: true });
        }

        // Define na memória que o alvo pertence à sua call atual
        coleiras.set(alvo.id, callDoMestre.id);
        
        // Puxa o alvo na hora para a sua chamada
        await alvo.voice.setChannel(callDoMestre).catch(() => null);

        await interaction.reply({ content: `🐕 **${alvo.user.username}** foi colocado na coleira! Pelos próximos 5 minutos ele será arrastado de volta se tentar sair de onde você está.`, ephemeral: true });

        // Remove o efeito estritamente após 5 minutos
        setTimeout(() => {
            if (coleiras.has(alvo.id)) {
                coleiras.delete(alvo.id);
                interaction.followUp({ content: `🔓 A coleira de **${alvo.user.username}** estourou! Ele está livre agora.`, ephemeral: true });
            }
        }, 300000);
        return;
    }

    // COMANDO POR CHAT: /rodar [usuario]
    if (commandName === 'rodar') {
        if (!alvo?.voice?.channel) {
            return interaction.reply({ content: `❌ O usuário **${alvo?.user?.username || 'Alvo'}** precisa estar conectado em uma call de voz para rodar!`, ephemeral: true });
        }

        await interaction.reply({ content: `🚀 Iniciando! Movendo **${alvo.user.username}** por várias calls sem parar por 5 minutos.`, ephemeral: true });

        const voiceChannels = guild.channels.cache
            .filter(c => c.type === ChannelType.GuildVoice)
            .map(c => c);

        if (voiceChannels.length < 2) {
            return interaction.followUp({ content: '❌ O servidor precisa de pelo menos 2 calls de voz criadas para eu poder rodar alguém!', ephemeral: true });
        }

        let index = 0;

        const loopRodar = async () => {
            if (!alvo?.voice?.channel) return; 

            const proximaCall = voiceChannels[index];
            
            if (alvo.voice.channelId !== proximaCall.id) {
                await alvo.voice.setChannel(proximaCall).catch(() => null);
            }

            index = (index + 1) % voiceChannels.length;
        };

        loopRodar();
        const intervaloRodar = setInterval(loopRodar, 1500);

        setTimeout(() => {
            clearInterval(intervaloRodar);
            interaction.followUp({ content: `⏰ Tempo esgotado! O ciclo do comando rodar em **${alvo.user.username}** acabou.`, ephemeral: true });
        }, 300000);
        return;
    }

    // --- SEUS OUTROS COMANDOS CONTINUAM ABAIXO ---
    if (commandName === 'ativarvip') {
        const tipo = vipsPendentes.get(user.id);
        if (!tipo) return interaction.reply({ content: '❌ Sem VIP pendente.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        const conf = VIPS_CONFIG[tipo];
        const cargoT = await guild.roles.create({ name: `Tag • ${user.username}`, color: '#ffffff' });
        cargoCallDono.set(user.id, cargoT.id);
        await member.roles.add([conf.role, cargoT.id]);
        const ch = await guild.channels.create({
            name: `[VIP] ${user.username}`, type: ChannelType.GuildVoice, parent: conf.category,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionFlagsBits.Connect] },
                { id: cargoT.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
                { id: user.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.ManageChannels] },
            ],
        });
        vipsPendentes.delete(user.id);
        return interaction.editReply(`💎 VIP Ativado em: ${ch}`);
    }

    if (commandName === 'addpessoa') {
        const tId = cargoCallDono.get(user.id);
        if (!tId) return interaction.reply({ content: '❌ Sem tag VIP.', ephemeral: true });
        await alvo.roles.add(tId);
        return interaction.reply({ content: '✅ Amigo adicionado!', ephemeral: true });
    }

    if (commandName === 'nometag') {
        const tId = cargoCallDono.get(user.id);
        const c = guild.roles.cache.get(tId);
        if (!c) return interaction.reply({ content: '❌ Tag não encontrada.', ephemeral: true });
        await c.setName(options.getString('nome'));
        return interaction.reply({ content: '✅ Nome alterado!', ephemeral: true });
    }

    if (commandName === 'addvip') {
        if (!eHigher && !eDono) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
        vipsPendentes.set(alvo.id, options.getString('tipo'));
        return interaction.reply({ content: '✅ VIP Autorizado.', ephemeral: true });
    }

    if (commandName === 'backup') {
        if (!eDono && !member.roles.cache.has(CARGO_BACKUP_PERM_ID)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
        const roles = backupCargos.get(alvo?.id);
        if (!roles) return interaction.reply({ content: '❌ Sem backup.', ephemeral: true });
        await alvo.roles.set(roles);
        backupCargos.delete(alvo.id);
        return interaction.reply({ content: '✅ Restaurado.', ephemeral: true });
    }

    if (['mutarcall', 'desmutarcall', 'castigo', 'ban'].includes(commandName)) {
        if (!member.roles.cache.has(CARGO_MOD_ID) && !eHigher && !eDono) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
        try {
            if (commandName === 'mutarcall') {
                usuariosMutados.add(alvo.id);
                await alvo.voice.setMute(true);
                interaction.reply({ content: '🔇 Mutado.', ephemeral: true });
                setTimeout(() => usuariosMutados.delete(alvo.id), options.getInteger('tempo') * 60000);
            } else if (commandName === 'castigo') {
                await alvo.timeout(options.getInteger('tempo') * 60000);
                interaction.reply({ content: '⏳ Castigado.', ephemeral: true });
            } else if (commandName === 'ban') {
                await alvo.ban();
                interaction.reply({ content: '🔨 Banido.', ephemeral: true });
            } else if (commandName === 'desmutarcall') {
                usuariosMutados.delete(alvo.id);
                await alvo.voice.setMute(false);
                interaction.reply({ content: '🔊 Desmutado.', ephemeral: true });
            }
        } catch (e) { interaction.reply({ content: `Erro: ${e.message}`, ephemeral: true }); }
    }
});

// 🟢 MONITORAMENTO DE VOZ
client.on('voiceStateUpdate', (oldS, newS) => {
    if (usuariosMutados.has(newS.id) && !newS.serverMute) {
        newS.setMute(true).catch(() => null);
    }

    if (coleiras.has(newS.id)) {
        const idCallCerta = coleiras.get(newS.id);
        if (newS.channelId !== idCallCerta) {
            if (newS.channelId) {
                newS.setChannel(idCallCerta).catch(() => null);
                console.log(`[Coleira] Alvo tentou escapar e foi puxado de volta.`);
            }
        }
    }
});

client.login(TOKEN);