# ❓ Kysymyksiä

# Kysymyksiä

Onko enkkuserverillä Oddnookossa käytössä /home ja jos on, niin kuin monta?  
Onko /tpa käytössä Oddnookissa tai muissa enkkupalvelimissa?

# ℹ️ INDEX

This guide provides an overview of the tools and commands available to Game Educators and Moderators on the School of Gaming Minecraft server, as well as an explanation of how the server environment functions. Each club server within the main server has its own unique features and rules, which are described in separate guides for those specific regions.

By familiarizing yourself with this guide, you will be better prepared to carry out your responsibilities as a Game Educator or Moderator on the SOG server, helping ensure a safe, fun, and educational experience for all players.

To make the most of this guide, **you should already have basic Minecraft skills** and be familiar with the fundamental commands used for guiding and moderating players.

## Contact Server Staff

If you have any questions, ideas for improvement, or notice that something on the server is not working as intended, please contact the server staff. You can do this by opening a **Minecraft Java Server ticket** on Discord.

**Lobby → \#open-ticket → Minecraft Java Server**

| ✨ | *Future insights\!* |
| :---- | :---- |

| 👉 | /commandsAnd how to \-instructions. |
| :---- | :---- |

| ❗ | *Important note\!* |
| :---- | :---- |

| 💡 | Tips, good to know\! |
| :---- | :---- |

| 🩵 | Finnish server only. |
| :---- | :---- |

# Content

[**Gedu Role Overview**](#gedu-role-overview)

* Permissions  
* Internal Gedu Chat  
* Gedu Vault  
* Gedu Hut

[**Running the Club**](#running-the-club)

* Most common commands needed  
* Opening and closing the server

[**Moderation**](#moderation)

* Server Rules  
* Moderation Practices  
* Reporting a moderation incident outside your club  
* Automated Moderation Systems  
* Mods, shaders ertc.

[**Tools**](#tools)

* View Inventory/Enderchest  
* 

[**NPCs**](#npcs)

* Shopkeeper NPCs


[**Teams**](#teams)

* Team specific commands

[**Basic Minecraft Commands List**](#basic-minecraft-commands)

# 📜 Server Overview

# Server Overview

The School of Gaming Minecraft server is built around **the Hub**. The Hub acts as a central lobby, allowing players to travel to different parts of the Sogverse. The Hub itself is also an adventure, as exploring it reveals the history of the Sogverse and various hidden secrets.

Currently, anyone can join the SOG Minecraft server, but some areas are restricted to specific club groups or are only available during events.

The server includes various roles with different permissions. A player’s role is displayed in front of their name and in the player list accessed with the tab key.

The Hub and its open game modes are currently available 24/7. Server activity is monitored using tools such as a chat filter and game chat logs, which are visible to Server Staff.

School of Gaming clubs and camps are run on two separate server environments: **the Finnish server and the international server.**

| ✨ | *In the future, access to the server will be limited to players with a valid club subscription. The server will automatically retrieve this information from the Sogverse system. As a result, many moderation guidelines will change.* |
| :---- | :---- |

**💙 Finnish Server Address:**  
fi.mc.sog.gg

**🧡 International Server Address**  
 en.mc.sog.gg

## Commands everyone can use

Tähän jotakin että pelaajat voivat käyttää näitä komentoja kaikilla palvelimilla ellei erikseen määritelty.

Spawn  
Sit  
Crawl  
Spin  
tpa

# 🧙 Gedu Role Overview

# Gedu Role Overview {#gedu-role-overview}

Whenever you visit the server, you represent the Gedu role and are considered to be in the position of a Game Educator. This means that even if you are playing in open modes during your free time, you cannot ignore situations that require moderation or when a gamer asks for help.

| ❗ | While on SOG servers, make sure that your character’s appearance/name is appropriate and suitable for players of all ages. |
| :---- | :---- |

## Gedu Permissions

A Game Educator has several permissions related to moderation and club management. Detailed information about moderation permissions can be found in the [**Moderation tab**](#moderation).

| 👉 | When running commands that affect multiple players, you may need to add the word minecraft: before the command for it to work on our server. /minecraft:give @a bread |
| :---- | :---- |

### List of Gedu permissions

* Teleporting players  
* Changing a player’s game mode  
* Changing the server time and weather  
* Adjusting the server difficulty  
* Muting players for a set duration or indefinitely  
* Removing players from the server  
* Banning players for a set duration or indefinitely  
* Opening and closing servers  
* Bypassing claims  
* Viewing player inventories and ender chests  
* Viewing block and chest history logs  
* Teleporting to Destination locations  
* Building at the Open Survival spawn  
* Transforming themselves or a player


## Internal Gedu Chat

Different roles can communicate with each other through the internal chat system. The chat is **shared across servers**, meaning that all players with the same role can see the messages. For example, if a game educator sends a message in the internal chat in the Hub, a game educator in Laamalaakso will also see it. This helps facilitate communication between game educators during lessons.

Note that the Finnish and English servers have separate internal chats, and messages are not visible between them.

| 👉 | /geduchat Write your message here. Allows you to view the inventory of a player. |
| :---- | :---- |

## Gedu Vault \[Finnish Server Only\]

Gedu Vault is a tool for game educators to use during clubs. With the Gedu Vault, you can set breaks, send notifications during transitions, and store various items in your locker. Some messages from the Command Center are displayed in either English or Finnish, depending on the player’s game language.

Gamers are not allowed in the Gedu Vault.

| 👉 | /desti tp geduvault This command will teleport you to the Geduvault. |
| :---- | :---- |

**Storage Room**  
In the storage area, each game educator has their own locker, and you can customize the nameplate to your liking. Each group also has its own set of lockers, allowing you to store items in chests specific to that group.

**Messageboard**  
On the message wall, you can save locations, leave nice messages, or jot down short notes for yourself.  
Note that maintaining and updating the Messageboard is up to Game Educators.

**Command Center**  
From the Command Center, you can use buttons to display transition messages to players.

Players must always be notified of upcoming breaks, active breaks, the end of a break, and when the server is about to close.

Starting a break automatically sets players to Adventure mode, except for game educators. When the break ends, players are returned to Survival mode.

## Gedu Hut \[English Server Only\]

Gedu Hut is the game educator’s personal base. Club members cannot enter it **unless you accidentally leave the door open.** You are free to modify the Hut to suit your own needs or even turn it into your home. The Hut already contains several chests and signs, making it easy to store important resources or take notes.

| 💡 | The Gedu Hut is protected with a region that allows gamers to enter but not interact/use. |
| :---- | :---- |

# 🗺️ Running the Club

# Running the Club {#running-the-club}

## Most needed commands

* Open, close and soft close a server  
* Change players game mode  
* Change time/weather  
* Change difficulty  
* Teleport players  
* Inspect tool

| 💡 | Check the Server Specific tab to see if the server you are using includes any custom commands or items you should be aware of (such as /home or /sit). |
| :---- | :---- |

## Opening the server

Only open the server after you have gone through the day’s schedule with the club participants.

| 👉 | /server server-name open  |
| :---- | :---- |

## Closing and Softclosing the server

Remember to close the server at the end of the club session. Start the closing routine in good time and always inform players 15 and 5 minutes before the server shuts down.

When the server is soft closed, no new players can join, but players who are already on the server will not be kicked out. Soft closing is recommended during club sessions to prevent additional players from joining.

| 👉 | /server server-name close Server will be closed and all the participants except for Game Educators will be moved to Hub. |
| :---- | :---- |
|  | **/server server-name softclose** Players who are already on the server will remain connected, but no new players will be able to join. Players also cannot be sent to a closed server using the /send command. |

| 🩵 | In the Finnish server, do not close the server if another club is overlapping with yours and the clubs do not end at the same time. Closing the server in this situation would move all players to the Hub. Instead, ask your group to leave the server. If they do not leave, send the players to the Hub. |
| :---- | :---- |

# 🚨 Moderation

# Moderation {#moderation}

The security of the School of Gaming Minecraft server is very important to us, which is why moderation measures are strict. Currently, anyone with the server address can join the server.

| ✨ | *In the future, access to the server will be limited to players with a valid club subscription. The server will automatically retrieve this information from the Sogverse system. As a result, many moderation guidelines will change.* |
| :---- | :---- |

Moderation actions range from mild warnings to permanent bans. All actions can be either temporary or permanent, and **there must always be a valid reason for any action taken**.

If a player involved in School of Gaming clubs receives disciplinary action, they may appeal or discuss the decision **with their assigned game educator.** If the player does not have an assigned game educator, the decision remains in effect unless they later join a club and are assigned one.

**In general, major rule violations are not addressed directly with players who are not registered clients of School of Gaming.**

| ❗ | *A game educator can always lift penalties imposed on a player, so it is acceptable to assign a punishment that extends beyond the player’s club day. In some cases, players may also need to be suspended from their club if their behavior warrants it.* |
| :---- | :---- |

# Reporting a moderation incident outside your club

**🩵 FINNISH SERVER ONLY\!**

If during your club session you notice that a player from another group has been involved in rule violations such as griefing or theft, **you should open a moderation case**. This allows the player’s assigned game educator to participate in the discussion.

When you enter the command, a forum topic will be created in Discord under the Minecraft Java Servers category in the moderation section. Add screenshots and any relevant information to the topic if needed. A moderator will then help identify the player’s group and game educator and will continue handling the case.

| 👉 | /warn PlayerName \-s Reason stated. /warn SOGGamer \-s Theft. Warned gamer won’t see the warning message because of \-s but the command opens a moderation case on Discord Modration section. |
| :---- | :---- |

# Handling Cases Involving Only the Parties Concerned

We do not disclose the identity of the player who committed the theft or rule violation to other players, as this may lead to a cycle of retaliation. Instead, inform the affected player that the responsible player has been identified and that a game educator will handle the matter with them.

**If a player requires the stolen items immediately**, or if it is unclear whether the items can be returned, a moderator or game educator may facilitate the return of the items.

The player who committed the theft must return the items to a game educator, who will then handle their disposal. **The player is not allowed to keep any stolen items.**

| 🩵 | In Finnish server, make sure to record in the open Moderation Case Topic (see above) what you have returned. |
| :---- | :---- |

# Automated Moderation Systems

## Chat Filters

The server uses a chat filter to prevent spam and the use of offensive language and profanity. Messages that trigger the filter are visible to game educators for review, but they are not sent to other players. From the player’s perspective, it appears that the message did not go through, and it will not be visible to anyone else in the server.

# 🔨 Tools

# Tools {#tools}

For Mute, Kick, Ban and Send check tab: [Moderation](#heading=h.63nij7pn06mz).

## Ban

Banning prevents a player from joining the server for the duration of the ban. The ban targets the player's hidden UUID, meaning they cannot bypass the ban by changing their character's name or IP address. The ban applies to the entire server, so a ban issued in the Hub will also affect the player in other areas like Open Survival.

| ❗ | *When a player’s actions on the server are restricted, a reason must always be provided. The reason should be noted briefly and clearly in the command.* |
| :---- | :---- |

| 👉 | /ban target lentgh reason /ban PlayerName 6 mo Inappropriate messages in chat./ban PlayerName 6 mo Breaking server rules \- theft. If the duration is left empty when banning a player, the ban will be indefinite (permanent). |
| :---- | :---- |
|  | **/unban PlayerName** Removes the ban. |
|  | **/banlist** Lists banned players. |

## Mute

Players can be muted for different durations. Muting is typically used during clubs or events when an issue can be addressed immediately, and removing the player from the server is not necessary. A muted player **cannot use the /msg or /whisper commands**, which prevents them from communicating in the game, even with a game educator.

| 👉 | /mute  /mute PlayerName 10m This command mutes the player for 10 minutes. The duration can be adjusted depending on the situation. |
| :---- | :---- |
|  | **/unmute**  /unmute PlayerName This command removes the mute from the player. |

## Kick

Kicking a player removes them from the server, but they **can rejoin** if they choose. This command is mainly useful in situations where **a non-member accidentally joins a server** during a lesson and does not leave when asked by the game educator.

Sometimes, extra players might end up in the wrong place, but they usually understand when you explain that the server is currently open only for those involved in the lesson.

| 👉 | /kick PlayerName |
| :---- | :---- |

## Send

You can send a player from one server to another using this command. It is useful in situations where a player is unable to find their way to the correct server. The server must be open for this command to work.

| 👉 | /send PlayerName |
| :---- | :---- |

## View players Inventory / Enderchest

As a game educator, you have the ability to view the inventory and ender chest contents of **any online player**. Additionally, you can transfer items between your own inventory or ender chest and the player's inventory or ender chest. This tool is particularly useful for managing in-game resources, assisting players, or resolving issues related to lost or stolen items.

| ✨ | *A tool for viewing the inventory of offline players is currently under development and will be  introduced in the future* |
| :---- | :---- |

| 👉 | /inventory PlayerName Allows you to view the inventory of a player. |
| :---- | :---- |
|  | **/inventory PlayerName enderchest** Allows you to view the contents of a player's ender chest. |

## Co Inspect

## Home

## Gedu Items

# 🧑‍🚀 NPCs

# NPCs {#npcs}

In Sofverse there are many NPCs with various tasks. While game educators cannot create NPCs, it is **important to know how to interact with them.**

NPCs can be player characters, animals, or objects. They may either remain stationary or move around, and players are not able to modify or break them.

**NPCs talk**  
Many NPCs will speak when a player approaches them. The chat is visible only to the player who triggered the interaction. This means that an NPC can display different lines to multiple players at the same time, but each player will only see their own conversation.

| 💡 | Some NPCs only speak when clicked, or the speech may appear as a speech bubble above the character’s head instead of in the chat. |
| :---- | :---- |
|  | Players can **trigger various actions** by interacting with an NPC. For example, in the Hub, an NPC can teleport a player to a predetermined location when the player clicks on the character. |

## Shopkeeper NPCs

Some NPCs have the ability to sell items. To open an NPC’s shop, right-click on the character. A menu will appear showing what the NPC offers and what is required in exchange for the items.

\[kuva menusta\]

# 🏳️ Teams

# Teams {#teams}

**🩵 FINNISH SERVER ONLY\!**

On some servers, teams are used to quickly identify whether a player belongs to the club, especially when the group is large. Additionally, if multiple groups are playing in the same world simultaneously, teams allow game educators to run commands that only affect their specific team.

Game educators have permissions to add and remove players from teams. Please do not create teams, as all required teams already exist on our servers.

**A player can only belong to one team at a time.**

| 👉 | /team join TeamName PlayerName Adds a player in a team. |
| :---- | :---- |
|  | **/team leave PlayerName** Removes a player from the team. |

## Team specific commands

If multiple groups are playing on the same server at the same time, you should not use the @a operator when running commands, as this would affect all players. Instead, target your own team when executing commands. Below are the most common commands, but other commands follow the same logic.

| 👉 | /teammsg Write message here. Sends message only your team can see. |
| :---- | :---- |
|  | **/minecraft:tp @a\[team=TeamName\] PlayerName** Teleports your team to yourself (or whoever the target might be). |
|  | **/minecraft:gamemode adventure @a\[team=Teamname\] /minecraft:gamemode survival @a\[team=Teamname\]** Changes the game mode for the whole team. |

# 📄 Basic Minecraft Commands

# Basic Minecraft Commands {#basic-minecraft-commands}

**Teleporting**

| /tp Player1 Player2 | Teleport Player1 to Player2 |
| :---- | :---- |
| /minecraft:tp @e\[type=minecraft:horse,name="banana"\] PlayerName | Teleports a horse named banana to PlayerName. |

**Game Mode**

| /gamemode creative | Changes game mode for you. |
| :---- | :---- |
| /gamemode creative PlayerName | Changes game mode for PlayerName. |
| /gamemode creative @a | Changes game mode for everyone. |

**Weather**

| /weather sun | Changes weather to sun. |
| :---- | :---- |
| /gamerule doWeatherCycle true/false | Locks and unlocks weather cycle. |

**Time**

| /time set day | Changes time to day. |
| :---- | :---- |
| /time set 1000 | Changes time to day. |
| /gamerule doDayCycle true/false | Locks and unlocks day cycle. |

**Difficulty**

| /difficulty peaceful | Changes difficulty to peaceful. |
| :---- | :---- |
| /difficulty normal | Changes difficulty to normal. |

# 🇫🇮 Finnish Servers

# 💙 Server: FIN Hub

# FIN Hub

# 🌷 Server: Plots

# 🦙 Server: Laamalaakso

# 🪄 Server: Lumolymy

# 🇬🇧 International Servers

# Server: Oddnook

