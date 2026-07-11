#!/usr/bin/env node

import "dotenv/config";
import {
  ActionRowBuilder,
  Client,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  MessageFlags,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";
import { handleDiscordObservation } from "./src/lib/discord-interactions.js";
import { handleDiscordInteraction } from "./src/lib/discord-interactions.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID ?? null;

if (!token) {
  console.error("DISCORD_TOKEN 환경변수가 필요합니다.");
  process.exit(1);
}

function optionString(command, name, description, required = false) {
  return command.addStringOption((option) => option.setName(name).setDescription(description).setRequired(required));
}

function buildCommands() {
  const commands = [
    new SlashCommandBuilder().setName("start").setDescription("기본 게임 세션을 시작합니다."),
    new SlashCommandBuilder().setName("status").setDescription("현재 세션 상태를 확인합니다."),
    new SlashCommandBuilder().setName("complete").setDescription("현재 미션을 완료합니다."),
    new SlashCommandBuilder().setName("checkpoint").setDescription("다음 단계로 이동할 체크포인트를 엽니다."),
    new SlashCommandBuilder().setName("next").setDescription("다음 미션을 선택합니다."),
    new SlashCommandBuilder().setName("emergency").setDescription("범용 미션으로 전환합니다."),
    new SlashCommandBuilder().setName("ending").setDescription("엔딩 문구를 생성합니다."),
    new SlashCommandBuilder().setName("finish").setDescription("게임을 종료 상태로 바꿉니다."),
    new SlashCommandBuilder().setName("reset").setDescription("현재 채널의 세션을 초기화합니다."),
    new SlashCommandBuilder()
      .setName("start-experience")
      .setDescription("경험 세션을 바로 시작합니다.")
      .addIntegerOption((option) => option.setName("duration").setDescription("진행 시간(분)")),
    new SlashCommandBuilder()
      .setName("extend-time")
      .setDescription("진행 시간을 연장합니다.")
      .addIntegerOption((option) => option.setName("minutes").setDescription("연장할 시간(분)").setRequired(true)),
    new SlashCommandBuilder()
      .setName("shorten-time")
      .setDescription("진행 시간을 단축합니다.")
      .addIntegerOption((option) => option.setName("minutes").setDescription("단축할 시간(분)").setRequired(true)),
    new SlashCommandBuilder().setName("time-left").setDescription("남은 시간을 확인합니다."),
    new SlashCommandBuilder().setName("join").setDescription("현재 로비에 참가합니다."),
    new SlashCommandBuilder().setName("leave").setDescription("현재 로비에서 나갑니다."),
    new SlashCommandBuilder().setName("choose-flow").setDescription("경험 흐름을 선택합니다."),
    new SlashCommandBuilder().setName("begin").setDescription("메인 메뉴를 엽니다."),
    new SlashCommandBuilder().setName("continue").setDescription("다음 장면으로 진행합니다."),
    new SlashCommandBuilder().setName("end").setDescription("경험을 종료합니다."),
    new SlashCommandBuilder()
      .setName("upload-photo")
      .setDescription("사진을 제출합니다.")
      .addAttachmentOption((option) => option.setName("photo").setDescription("제출할 사진").setRequired(true))
      .addStringOption((option) => option.setName("note").setDescription("사진에 대한 짧은 설명"))
  ];

  optionString(commands[0], "players", "참가자 이름을 쉼표로 구분해 입력합니다.");
  optionString(commands[0], "tags", "환경 태그를 쉼표로 구분해 입력합니다.");
  optionString(commands[0], "flow", "흐름 ID를 지정합니다.");

  optionString(commands[9], "players", "참가자 이름을 쉼표로 구분해 입력합니다.", true);
  optionString(commands[9], "flow", "흐름 ID를 지정합니다.");

  optionString(commands[15], "flow", "선택할 흐름 ID를 지정합니다.", true);
  return commands;
}

function buildModal(responseData) {
  const modal = new ModalBuilder().setCustomId(responseData.custom_id).setTitle(responseData.title);
  for (const row of responseData.components ?? []) {
    const inputs = row.components.map((component) =>
      new TextInputBuilder()
        .setCustomId(component.custom_id)
        .setLabel(component.label)
        .setStyle(component.style === 1 ? TextInputStyle.Short : TextInputStyle.Paragraph)
        .setRequired(component.required ?? false)
    );
    for (const [index, input] of inputs.entries()) {
      const source = row.components[index];
      if (source.placeholder) {
        input.setPlaceholder(source.placeholder);
      }
      if (source.value) {
        input.setValue(source.value);
      }
    }
    modal.addComponents(new ActionRowBuilder().addComponents(...inputs));
  }
  return modal;
}

function toRawOption(option) {
  return {
    name: option.name,
    value: option.value
  };
}

function toRawInteraction(interaction) {
  const base = {
    id: interaction.id,
    type: interaction.isChatInputCommand() ? 2 : interaction.isButton() ? 3 : interaction.isModalSubmit() ? 5 : 1,
    token: interaction.token,
    guild_id: interaction.guildId ?? null,
    channel_id: interaction.channelId,
    member: interaction.member?.user
      ? {
          user: {
            id: interaction.member.user.id,
            username: interaction.member.user.username,
            global_name: interaction.member.user.globalName ?? undefined
          }
        }
      : undefined,
    user: interaction.user
      ? {
          id: interaction.user.id,
          username: interaction.user.username,
          global_name: interaction.user.globalName ?? undefined
        }
      : undefined,
    message: interaction.message?.id ? { id: interaction.message.id } : undefined,
    data: {}
  };

  if (interaction.isChatInputCommand()) {
    base.data = {
      name: interaction.commandName,
      options: interaction.options.data.map((option) => {
        if (option.options?.length) {
          return {
            name: option.name,
            options: option.options.map(toRawOption)
          };
        }
        return toRawOption(option);
      })
    };
  } else if (interaction.isButton()) {
    base.data = {
      custom_id: interaction.customId
    };
  } else if (interaction.isModalSubmit()) {
    const knownFields = ["foreshadowText", "mood", "answer", "text", "choice", "reflection"];
    const components = knownFields
      .map((customId) => {
        try {
          const value = interaction.fields.getTextInputValue(customId);
          return value
            ? {
                components: [
                  {
                    custom_id: customId,
                    value
                  }
                ]
              }
            : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    base.data = {
      custom_id: interaction.customId,
      components
    };
  }

  return base;
}

function shouldDeferInteraction(interaction) {
  if (interaction.isModalSubmit()) {
    return true;
  }
  if (interaction.isChatInputCommand()) {
    return [
      "start",
      "start-experience",
      "choose-flow",
      "continue",
      "end",
      "upload-photo",
      "extend-time",
      "shorten-time",
      "time-left"
    ].includes(interaction.commandName);
  }
  if (interaction.isButton()) {
    return ["lobby:ready", "scene:upload-photo", "scene:retry-ai", "ending:retry-ai"].includes(interaction.customId) || interaction.customId.startsWith("flow:");
  }
  return false;
}

async function respondFromHandler(interaction, response) {
  if (response.type === 1) {
    return;
  }

  if (response.type === 9) {
    await interaction.showModal(buildModal(response.data));
    return;
  }

  const payload = {
    content: response.data?.content,
    components: response.data?.components,
    ephemeral: response.data?.flags === 64
  };

  if (response.type === 7 && interaction.isMessageComponent() && !interaction.deferred && !interaction.replied) {
    await interaction.update(payload);
    return;
  }

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
    return;
  }

  await interaction.reply(payload);
}

async function registerCommands() {
  if (!clientId) {
    console.warn("DISCORD_CLIENT_ID가 없어 슬래시 명령어 등록을 건너뜁니다.");
    return;
  }

  const rest = new REST({ version: "10" }).setToken(token);
  const payload = buildCommands().map((command) => command.toJSON());

  if (guildId) {
    try {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: payload });
      console.log(`길드 슬래시 명령어 ${payload.length}개를 등록했습니다.`);
      return;
    } catch (error) {
      console.warn(`길드 명령어 등록에 실패해 전역 등록으로 전환합니다: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await rest.put(Routes.applicationCommands(clientId), { body: payload });
  console.log(`전역 슬래시 명령어 ${payload.length}개를 등록했습니다.`);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once(Events.ClientReady, () => {
  console.log(`${client.user.tag} 봇이 실행 중입니다.`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.isChatInputCommand() && !interaction.isButton() && !interaction.isModalSubmit()) {
      return;
    }
    if (interaction.isChatInputCommand() && interaction.commandName === "upload-photo") {
      const attachment = interaction.options.getAttachment("photo");
      if (!attachment) {
        await interaction.reply({
          content: "사진 파일을 첨부해 주세요.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await interaction.deferReply();
      const note = interaction.options.getString("note") ?? "";
      const sessionKey = `${interaction.guildId ?? "dm"}:${interaction.channelId}`;
      const result = await handleDiscordObservation(sessionKey, {
        type: "photo",
        sourceId: interaction.user.id,
        sourceName: interaction.user.username ?? interaction.user.globalName ?? "플레이어",
        channelId: interaction.channelId,
        sceneId: null,
        payload: {
          content: note,
          attachments: [
            {
              id: attachment.id,
              name: attachment.name ?? null,
              url: attachment.url,
              contentType: attachment.contentType ?? null,
              size: attachment.size ?? null
            }
          ]
        }
      });
      if (result.response) {
        await respondFromHandler(interaction, result.response);
      } else {
        await interaction.editReply({ content: "사진이 저장되었습니다. 남은 입력이 있으면 이어서 제출해 주세요." });
      }
      return;
    }
    if (shouldDeferInteraction(interaction)) {
      if (interaction.isButton()) {
        await interaction.deferUpdate();
      } else {
        await interaction.deferReply();
      }
    }
    const rawInteraction = toRawInteraction(interaction);
    const response = await handleDiscordInteraction(rawInteraction);
    await respondFromHandler(interaction, response);
  } catch (error) {
    console.error(error);
    const message = `오류: ${error instanceof Error ? error.message : String(error)}`;
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: message });
    } else {
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
    }
  }
});

await registerCommands();
try {
  await client.login(token);
} catch (error) {
  console.error(`Discord 로그인에 실패했습니다: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
