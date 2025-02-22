import dotenv from "dotenv";
import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
  AttachmentBuilder,
} from "discord.js";
import axios from "axios";
import { createCanvas, loadImage, registerFont } from "canvas";
import express from "express";

// Load environment variables
dotenv.config();

// Get tokens from environment
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const HYPIXEL_API_KEY = process.env.HYPIXEL_API_KEY;

// Initialize the Discord bot
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// Store verification status and cooldowns in memory
const verifiedUsers = new Set();
const cooldowns = new Map(); // Stores cooldown timestamps for users

// Register Minecraft font
registerFont("./Minecraft.ttf", { family: "Minecraft" }); // Ensure "Minecraft.ttf" is in the same directory

// Function to fetch UUID from Minecraft username using Mojang API
async function getUUIDFromUsername(minecraftName) {
  try {
    const response = await axios.get(
      `https://api.mojang.com/users/profiles/minecraft/${minecraftName}`,
    );
    return response.data.id; // Returns the UUID
  } catch (error) {
    console.error("Error fetching UUID from Mojang API:", error);
    return null;
  }
}

// Function to fetch Hypixel player data
async function getHypixelPlayerData(uuid) {
  try {
    const response = await axios.get(
      `https://api.hypixel.net/player?key=${HYPIXEL_API_KEY}&uuid=${uuid}`,
    );
    return response.data.player;
  } catch (error) {
    console.error("Error fetching Hypixel data:", error);
    return null;
  }
}

// Function to fetch Hypixel guild data
async function getHypixelGuildData(playerUUID) {
  try {
    const response = await axios.get(
      `https://api.hypixel.net/guild?key=${HYPIXEL_API_KEY}&player=${playerUUID}`,
    );
    return response.data.guild;
  } catch (error) {
    console.error("Error fetching Hypixel guild data:", error);
    return null;
  }
}

// Function to calculate Hypixel level (rounded to natural numbers)
function calculateHypixelLevel(networkExp) {
  const level = Math.sqrt(2 * networkExp + 30625) / 50 - 2.5;
  return Math.floor(level); // Round down to natural number
}

// Function to format Hypixel rank and get rank color
function formatHypixelRank(playerData) {
  const rankMapping = {
    SUPERSTAR: {
      name: "MVP++",
      color: "#FFAA00",
      plusColor: playerData?.rankPlusColor || "#FFAA00",
    }, // MVP++ color
    MVP_PLUS: {
      name: "MVP+",
      color: "#00AAAA",
      plusColor: playerData?.rankPlusColor || "#FFAA00",
    }, // MVP+ color
    MVP: { name: "MVP", color: "#00AAAA", plusColor: "#00AAAA" }, // MVP color
    VIP_PLUS: { name: "VIP+", color: "#00AA00", plusColor: "#00AA00" }, // VIP+ color
    VIP: { name: "VIP", color: "#00AA00", plusColor: "#00AA00" }, // VIP color
    YOUTUBER: { name: "YOUTUBER", color: "#FF5555", plusColor: "#FF5555" }, // YOUTUBER color
    ADMIN: { name: "ADMIN", color: "#FF5555", plusColor: "#FF5555" }, // ADMIN color
    MODERATOR: { name: "MODERATOR", color: "#00AAAA", plusColor: "#00AAAA" }, // MODERATOR color
  };

  // Check for special ranks (e.g., ADMIN, MODERATOR, YOUTUBER)
  if (playerData.rank && playerData.rank !== "NORMAL") {
    return (
      rankMapping[playerData.rank] || {
        name: playerData.rank,
        color: "#AAAAAA",
        plusColor: "#AAAAAA",
      }
    ); // Default color for unknown ranks
  }

  // Check for MVP++ (monthly subscription rank)
  if (playerData.monthlyPackageRank === "SUPERSTAR") {
    return rankMapping.SUPERSTAR;
  }

  // Check for other monthly ranks (e.g., MVP_PLUS)
  if (
    playerData.monthlyPackageRank &&
    playerData.monthlyPackageRank !== "NONE"
  ) {
    return (
      rankMapping[playerData.monthlyPackageRank] || {
        name: playerData.monthlyPackageRank,
        color: "#AAAAAA",
        plusColor: "#AAAAAA",
      }
    );
  }

  // Check for purchased ranks (e.g., VIP, VIP+, MVP, MVP+)
  if (playerData.newPackageRank) {
    return (
      rankMapping[playerData.newPackageRank] || {
        name: playerData.newPackageRank,
        color: "#AAAAAA",
        plusColor: "#AAAAAA",
      }
    );
  }

  // Default to "Non-Rank" if no rank is found
  return { name: "Non-Rank", color: "#AAAAAA", plusColor: "#AAAAAA" };
}

// Function to generate a welcome image using mc-heads API
async function generateWelcomeImage(
  minecraftName,
  rank,
  level,
  guild,
  skinUrl,
  discordUsername,
) {
  const canvas = createCanvas(600, 300);
  const ctx = canvas.getContext("2d");

  // Load the background image
  const background = await loadImage("./Background1.png").catch((err) => {
    console.error("Failed to load background image:", err);
    return null;
  });

  if (background) {
    ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
  }

  // Load the Minecraft skin using mc-heads API
  let skin;
  try {
    skin = await loadImage(
      `https://mc-heads.net/body/${skinUrl}`, // mc-heads API for skins
    );
  } catch (err) {
    console.error("Failed to load skin image from mc-heads:", err);
    skin = null;
  }

  if (skin) {
    // Flip the skin horizontally to make it face left
    ctx.save(); // Save the current canvas state
    ctx.translate(canvas.width - 50, 50); // Move to the right side
    ctx.scale(-1, 1); // Flip horizontally
    ctx.drawImage(skin, 0, 0, 100, 200); // Draw the flipped skin
    ctx.restore(); // Restore the canvas state
  } else {
    console.log("Skipping skin rendering due to error.");
  }

  // Set the Minecraft font
  ctx.font = "25px Minecraft"; // Smaller font size for better fit

  // Add a darker transparent background for the text
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)"; // Darker transparent background
  ctx.fillRect(20, 40, 400, 200); // Rectangle behind the text

  // Draw the player's name with rank
  ctx.fillStyle = "#99bcf7"; // Rank and name color
  ctx.fillText(`[${rank.name}] ${minecraftName} Joined`, 30, 80);

  // Draw the "Guild" text and guild name
  ctx.fillStyle = "#99bcf7"; // Guild text and name color
  ctx.fillText("Guild:", 30, 120);
  ctx.fillText(guild, 110, 120);

  // Draw the "Level" text and level value
  ctx.fillStyle = "#f4f000"; // Level text and value color
  ctx.fillText("Level:", 30, 160); // Moved "Level" before "Discord"
  ctx.fillText(level.toString(), 110, 160); // Level as a natural number

  // Draw the "Discord" text and Discord username with space
  ctx.fillStyle = "#0f3684"; // Discord text and username color
  ctx.fillText("Discord:", 30, 200); // Moved "Discord" after "Level"
  ctx.fillText(discordUsername, 130, 200); // Added space between "Discord:" and the username

  // Return the image as a buffer
  return canvas.toBuffer();
}

// Bot is ready
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// Handle the !verify command
client.on("messageCreate", async (message) => {
  if (
    message.content === "!verify" &&
    message.channel.name === "『✅』verify"
  ) {
    try {
      if (verifiedUsers.has(message.author.id)) {
        // User is already verified, check cooldown
        const cooldown = cooldowns.get(message.author.id);
        const isAdmin = message.member.permissions.has(
          PermissionsBitField.Flags.Administrator,
        );

        if (cooldown && Date.now() < cooldown && !isAdmin) {
          const remainingTime = Math.ceil(
            (cooldown - Date.now()) / 1000 / 60 / 60,
          ); // Convert to hours
          const reply = await message.reply({
            content: `You are on cooldown. Please try again in ${remainingTime} hours.`,
            flags: "Ephemeral",
          });

          setTimeout(() => reply.delete().catch(console.error), 30000); // Delete after 30 seconds
          return;
        }

        // User is already verified, ask if they want to unverify
        const unverifyButton = new ButtonBuilder()
          .setCustomId("unverify_button")
          .setLabel("Unverify")
          .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(unverifyButton);

        const reply = await message.reply({
          content: "You are already verified. Do you want to unverify?",
          components: [row],
          flags: "Ephemeral",
        });

        setTimeout(() => reply.delete().catch(console.error), 30000); // Delete after 30 seconds
      } else {
        // User is not verified, start the verification process
        const verifyButton = new ButtonBuilder()
          .setCustomId("verify_button")
          .setLabel("Click to Verify")
          .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder().addComponents(verifyButton);

        const reply = await message.reply({
          content: "Please verify your Minecraft name.",
          components: [row],
          flags: "Ephemeral",
        });

        setTimeout(() => reply.delete().catch(console.error), 30000); // Delete after 30 seconds
      }
    } catch (error) {
      console.error("Failed to send ephemeral message:", error);
    }

    // Delete the user's !verify message
    await message.delete().catch((error) => {
      console.error("Failed to delete message:", error);
    });
  }
});

// Handle the !ha command
client.on("messageCreate", async (message) => {
  if (message.content.startsWith("!ha")) {
    // Check if the user has the "👔 • Angel Staff" role or any role above it
    const angelStaffRole = message.guild.roles.cache.find(
      (role) => role.name === "👔 • Angel Staff",
    );

    if (!angelStaffRole) {
      return message.reply({
        content: "The '👔 • Angel Staff' role does not exist in this server.",
        flags: "Ephemeral",
      });
    }

    // Check if the user has the "👔 • Angel Staff" role or a higher role
    const memberRoles = message.member.roles.cache;
    const hasPermission = memberRoles.some(
      (role) => role.position >= angelStaffRole.position,
    );

    if (!hasPermission) {
      return message.reply({
        content: "You do not have permission to use this command.",
        flags: "Ephemeral",
      });
    }

    // Extract the text from the command
    const text = message.content.slice("!ha".length).trim();
    if (!text) {
      return message.reply({
        content: "Please provide a message to send.",
        flags: "Ephemeral",
      });
    }

    // Send the message as the bot
    await message.channel.send(text);

    // Delete the user's !ha command message
    await message.delete().catch((error) => {
      console.error("Failed to delete message:", error);
    });
  }
});

// Handle button clicks
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === "verify_button") {
    // Create a modal for the user to input their Minecraft name
    const modal = new ModalBuilder()
      .setCustomId("verify_modal")
      .setTitle("Verify Minecraft Name");

    const minecraftNameInput = new TextInputBuilder()
      .setCustomId("minecraft_name")
      .setLabel("Minecraft Name")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Enter your Minecraft name")
      .setRequired(true);

    const actionRow = new ActionRowBuilder().addComponents(minecraftNameInput);
    modal.addComponents(actionRow);

    // Show the modal
    await interaction.showModal(modal);
  } else if (interaction.customId === "unverify_button") {
    // Handle unverify button click
    verifiedUsers.delete(interaction.user.id);

    // Remove the "✅• Verified" role
    const verifiedRole = interaction.guild.roles.cache.find(
      (role) => role.name === "✅• Verified",
    );
    if (verifiedRole) {
      const member = interaction.guild.members.cache.get(interaction.user.id);
      if (member) {
        await member.roles.remove(verifiedRole).catch(console.error);
      }
    }

    // Assign the "❌• Unverified" role
    const unverifiedRole = interaction.guild.roles.cache.find(
      (role) => role.name === "❌• Unverified",
    );
    if (unverifiedRole) {
      const member = interaction.guild.members.cache.get(interaction.user.id);
      if (member) {
        await member.roles.add(unverifiedRole).catch(console.error);
      }
    }

    await interaction.reply({
      content: "You have been unverified. You can verify again immediately.",
      flags: "Ephemeral",
    });
  }
});

// Handle modal submissions
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isModalSubmit()) return;

  if (interaction.customId === "verify_modal") {
    const minecraftName =
      interaction.fields.getTextInputValue("minecraft_name");
    const discordUsername = interaction.user.tag; // Get the Discord username

    // Fetch UUID from Mojang API
    const uuid = await getUUIDFromUsername(minecraftName);
    if (!uuid) {
      return interaction.reply({
        content:
          "Failed to fetch UUID from Mojang API. Please check your Minecraft name.",
        flags: "Ephemeral",
      });
    }

    // Fetch Hypixel player data
    const playerData = await getHypixelPlayerData(uuid);
    if (!playerData) {
      return interaction.reply({
        content: "Failed to fetch Hypixel data. Please try again later.",
        flags: "Ephemeral",
      });
    }

    // Check if Discord is linked
    const socialMedia = playerData.socialMedia;
    const discordLinked =
      socialMedia &&
      socialMedia.links &&
      socialMedia.links.DISCORD === interaction.user.tag;

    if (!discordLinked) {
      return interaction.reply({
        content:
          "Please link your Discord to your Hypixel profile in social media.",
        flags: "Ephemeral",
      });
    }

    // Calculate Hypixel level (rounded to natural numbers)
    const networkExp = playerData.networkExp || 0;
    const level = calculateHypixelLevel(networkExp); // Natural number

    // Fetch guild data
    const guildData = await getHypixelGuildData(uuid);
    const guildName = guildData?.name || "No Guild";

    // Get player rank and color
    const rank = formatHypixelRank(playerData);

    // Generate the welcome image using mc-heads API
    const imageBuffer = await generateWelcomeImage(
      minecraftName,
      rank,
      level,
      guildName,
      uuid,
      discordUsername,
    );

    // Send welcome message with the generated image
    const welcomeChannel = interaction.guild.channels.cache.find(
      (channel) => channel.name === "『👋』welcome",
    );
    if (welcomeChannel) {
      const attachment = new AttachmentBuilder(imageBuffer, {
        name: "welcome.png",
      });
      await welcomeChannel.send({
        content: `Welcome, **${minecraftName}**!`,
        files: [attachment],
      });
    }

    // Assign the "✅• Verified" role
    const verifiedRole = interaction.guild.roles.cache.find(
      (role) => role.name === "✅• Verified",
    );
    if (verifiedRole) {
      const member = interaction.guild.members.cache.get(interaction.user.id);
      if (member) {
        await member.roles.add(verifiedRole).catch(console.error);
      }
    }

    // Remove the "❌• Unverified" role (if present)
    const unverifiedRole = interaction.guild.roles.cache.find(
      (role) => role.name === "❌• Unverified",
    );
    if (unverifiedRole) {
      const member = interaction.guild.members.cache.get(interaction.user.id);
      if (member) {
        await member.roles.remove(unverifiedRole).catch(console.error);
      }
    }

    // Mark the user as verified
    verifiedUsers.add(interaction.user.id);

    // Set a 6-hour cooldown for unverifying (only for non-admins)
    const isAdmin = interaction.member.permissions.has(
      PermissionsBitField.Flags.Administrator,
    );
    if (!isAdmin) {
      cooldowns.set(interaction.user.id, Date.now() + 6 * 60 * 60 * 1000);
    }

    // Send success message only to the user
    await interaction.reply({
      content: "Verification successful!",
      flags: "Ephemeral",
    });
  }
});

// Start the bot
client.login(DISCORD_BOT_TOKEN);

// Express server to keep the bot alive
const app = express();

app.listen(3000, () => {
  console.log("Project is running!");
});

app.get("/", (req, res) => {
  res.send("Hello world!");
});
