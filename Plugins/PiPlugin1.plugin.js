/**
 * @name ShowHiddenChannels
 * @author DevilBro & thunderstorm010
 * @authorId 278543574059057154
 * @version 3.2.5
 * @description Displays all hidden Channels, which can't be accessed due to Role Restrictions, this won't allow you to read them (impossible)
 * @source https://github.com/LDzik/PiAnglePlugins/blob/main/Plugins/
 * @updateUrl https://raw.githubusercontent.com/LDzik/PiAnglePlugins/main/Plugins/PiPlugin1.plugin.js
 */

module.exports = (_ => {
	const changeLog = {
		
	};

	return !window.PiAngleLib_Global || (!window.PiAngleLib_Global.loaded && !window.PiAngleLib_Global.started) ? class {
		constructor (meta) {for (let key in meta) this[key] = meta[key];}
		getName () {return this.name;}
		getAuthor () {return this.author;}
		getVersion () {return this.version;}
		getDescription () {return `The Library Plugin needed for ${this.name} is missing. Open the Plugin Settings to download it. \n\n${this.description}`;}
		
		downloadLibrary () {
			require("request").get("https://raw.githubusercontent.com/LDzik/PiAnglePlugins/main/Library/PiAngleLib.plugin.js", (e, r, b) => {
				if (!e && b && r.statusCode == 200) require("fs").writeFile(require("path").join(BdApi.Plugins.folder, "PiAngleLib.plugin.js"), b, _ => BdApi.showToast("Finished downloading PiAngleLib Library", {type: "success"}));
				else BdApi.alert("Error", "Could not download PiAngleLib Library Plugin. Try again later or download it manually from GitHub: https://mwittrien.github.io/downloader/?library");
			});
		}
		
		load () {
			if (!window.PiAngleLib_Global || !Array.isArray(window.PiAngleLib_Global.pluginQueue)) window.PiAngleLib_Global = Object.assign({}, window.PiAngleLib_Global, {pluginQueue: []});
			if (!window.PiAngleLib_Global.downloadModal) {
				window.PiAngleLib_Global.downloadModal = true;
				BdApi.showConfirmationModal("Library Missing", `The Library Plugin needed for ${this.name} is missing. Please click "Download Now" to install it.`, {
					confirmText: "Download Now",
					cancelText: "Cancel",
					onCancel: _ => {delete window.PiAngleLib_Global.downloadModal;},
					onConfirm: _ => {
						delete window.PiAngleLib_Global.downloadModal;
						this.downloadLibrary();
					}
				});
			}
			if (!window.PiAngleLib_Global.pluginQueue.includes(this.name)) window.PiAngleLib_Global.pluginQueue.push(this.name);
		}
		start () {this.load();}
		stop () {}
		getSettingsPanel () {
			let template = document.createElement("template");
			template.innerHTML = `<div style="color: var(--header-primary); font-size: 16px; font-weight: 300; white-space: pre; line-height: 22px;">The Library Plugin needed for ${this.name} is missing.\nPlease click <a style="font-weight: 500;">Download Now</a> to install it.</div>`;
			template.content.firstElementChild.querySelector("a").addEventListener("click", this.downloadLibrary);
			return template.content.firstElementChild;
		}
	} : (([Plugin, PiAngleLib]) => {
		var blackList = [], overrideTypes = [];
		var hiddenChannelCache = {};
		var accessModal;
		
		const channelGroupMap = {
			GUILD_TEXT: "SELECTABLE",
			GUILD_VOICE: "VOCAL",
			GUILD_ANNOUNCEMENT: "SELECTABLE",
			GUILD_STORE: "SELECTABLE",
			GUILD_STAGE_VOICE: "VOCAL"
		};

		const typeNameMap = {
			GUILD_TEXT: "TEXT_CHANNEL",
			GUILD_VOICE: "VOICE_CHANNEL",
			GUILD_ANNOUNCEMENT: "NEWS_CHANNEL",
			GUILD_STORE: "STORE_CHANNEL",
			GUILD_CATEGORY: "CATEGORY",
			GUILD_STAGE_VOICE: "STAGE_CHANNEL",
			PUBLIC_THREAD: "THREAD",
			PRIVATE_THREAD: "PRIVATE_THREAD"
		};
		
		const renderLevels = {
			CAN_NOT_SHOW: 1,
			DO_NOT_SHOW: 2,
			WOULD_SHOW_IF_UNCOLLAPSED: 3,
			SHOW: 4
		};
		
		const sortOrders = {
			NATIVE: {value: "native", label: "Native Category in correct Order"},
			BOTTOM: {value: "bottom", label: "Native Category at the bottom"}
		};
		
		const UserRowComponent = class UserRow extends BdApi.React.Component {
			componentDidMount() {
				if (this.props.user.fetchable) {
					this.props.user.fetchable = false;
					PiAngleLib.LibraryModules.UserProfileUtils.getUser(this.props.user.id).then(fetchedUser => {
						this.props.user = Object.assign({}, fetchedUser, PiAngleLib.LibraryModules.MemberStore.getMember(this.props.guildId, this.props.user.id) || {});
						PiAngleLib.ReactUtils.forceUpdate(this);
					});
				}
			}
			render() {
				return PiAngleLib.ReactUtils.createElement(PiAngleLib.LibraryComponents.ListRow, {
					prefix: PiAngleLib.ReactUtils.createElement("div", {
						className: PiAngleLib.disCN.listavatar,
						children: PiAngleLib.ReactUtils.createElement(PiAngleLib.LibraryComponents.AvatarComponents.default, {
							src: PiAngleLib.UserUtils.getAvatar(this.props.user.id),
							status: PiAngleLib.UserUtils.getStatus(this.props.user.id),
							size: PiAngleLib.LibraryComponents.AvatarComponents.Sizes.SIZE_40,
							onClick: _ => {
								if (accessModal) accessModal.props.onClose();
								PiAngleLib.LibraryModules.UserProfileModalUtils.openUserProfileModal({
									userId: this.props.user.id,
									guildId: this.props.guildId
								});
							}
						})
					}),
					labelClassName: PiAngleLib.disCN.nametag,
					label: [
						PiAngleLib.ReactUtils.createElement("span", {
							className: PiAngleLib.disCN.username,
							children: this.props.user.nick || this.props.user.username,
							style: {color: this.props.user.colorString}
						}),
						!this.props.user.discriminator ? null : PiAngleLib.ReactUtils.createElement("span", {
							className: PiAngleLib.disCN.listdiscriminator,
							children: `#${this.props.user.discriminator}`
						}),
						this.props.user.bot && PiAngleLib.ReactUtils.createElement(PiAngleLib.LibraryComponents.BotTag, {
							style: {marginLeft: 6}
						})
					]
				});
			}
		};
		
		const RoleRowComponent = class RoleRow extends BdApi.React.Component {
			render() {
				return PiAngleLib.ReactUtils.createElement(PiAngleLib.LibraryComponents.ListRow, {
					prefix: PiAngleLib.ReactUtils.createElement("div", {
						className: PiAngleLib.disCNS.avataricon + PiAngleLib.disCNS.listavatar + PiAngleLib.disCNS.avatariconsizemedium + PiAngleLib.disCN.avatariconinactive,
						style: {
							boxSizing: "border-box",
							padding: 10
						},
						children: PiAngleLib.ReactUtils.createElement("div", {
							style: {
								borderRadius: "50%",
								height: "100%",
								width: "100%",
								backgroundColor: PiAngleLib.ColorUtils.convert(this.props.role.colorString, "RGB") || PiAngleLib.DiscordConstants.Colors.PRIMARY_DARK_300
							}
						})
					}),
					labelClassName: this.props.role.overwritten && PiAngleLib.disCN.strikethrough,
					label: PiAngleLib.ReactUtils.createElement("span", {
						children: this.props.role.name,
						style: {color: this.props.role.colorString}
					})
				});
			}
		};
	
		return class ShowHiddenChannels extends Plugin {
			onLoad () {
				overrideTypes = Object.keys(PiAngleLib.DiscordConstants.PermissionOverrideType);
				
				this.defaults = {
					sortOrder: {
						hidden: {
							value: sortOrders[Object.keys(sortOrders)[0]].value,
							description: "Sorts hidden Channels in",
							options: Object.keys(sortOrders).map(n => sortOrders[n])
						}
					},
					general: {
						showVoiceUsers:			{value: true, 		description: "Show connected Users in hidden Voice Channels"},
						showForNormal:			{value: true,		description: "Add Access-Overview ContextMenu Entry for non-hidden Channels"}
					},
					channels: {
						GUILD_CATEGORY:			{value: true},
						GUILD_TEXT:				{value: true},
						GUILD_VOICE:			{value: true},
						GUILD_ANNOUNCEMENT:		{value: true},
						GUILD_STORE:			{value: true},
						GUILD_STAGE_VOICE:		{value: true}
					}
				};
			
				this.patchedModules = {
					before: {
						Channels: "render",
						ChannelCategoryItem: "type",
						ChannelItem: "default",
						VoiceUsers: "render"
					},
					after: {
						useInviteItem: "default",
						ChannelItem: "default"
					}
				};
				
				this.css = `
					${PiAngleLib.dotCNS._showhiddenchannelsaccessmodal + PiAngleLib.dotCN.messagespopoutemptyplaceholder} {
						position: absolute;
						bottom: 0;
						width: 100%;
					}
				`;
			}
			
			onStart () {
				this.saveBlackList(this.getBlackList());
				
				PiAngleLib.PatchUtils.patch(this, PiAngleLib.LibraryModules.GuildUtils, "setChannel", {instead: e => {
					let channelId = (PiAngleLib.LibraryModules.VoiceUtils.getVoiceStateForUser(e.methodArguments[1]) || {}).channelId;
					if (!channelId || !this.isChannelHidden(channelId)) return e.callOriginalMethod();
				}});
				
				PiAngleLib.PatchUtils.patch(this, PiAngleLib.LibraryModules.UnreadChannelUtils, "hasUnread", {after: e => {
					return e.returnValue && !this.isChannelHidden(e.methodArguments[0]);
				}});
				
				PiAngleLib.PatchUtils.patch(this, PiAngleLib.LibraryModules.UnreadChannelUtils, "getMentionCount", {after: e => {
					return e.returnValue ? (this.isChannelHidden(e.methodArguments[0]) ? 0 : e.returnValue) : e.returnValue;
				}});

				this.forceUpdateAll();
			}
			
			onStop () {
				this.forceUpdateAll();
			}

			getSettingsPanel (collapseStates = {}) {
				let settingsPanel;
				return settingsPanel = PiAngleLib.PluginUtils.createSettingsPanel(this, {
					collapseStates: collapseStates,
					children: _ => {
						let settingsItems = [];
				
						for (let key in this.defaults.selections) settingsItems.push();
						
						settingsItems.push(PiAngleLib.ReactUtils.createElement(PiAngleLib.LibraryComponents.CollapseContainer, {
							title: "Settings",
							collapseStates: collapseStates,
							children: Object.keys(this.defaults.sortOrder).map(key => PiAngleLib.ReactUtils.createElement(PiAngleLib.LibraryComponents.SettingsSaveItem, {
								type: "Select",
								plugin: this,
								keys: ["sortOrder", key],
								label: this.defaults.sortOrder[key].description,
								basis: "50%",
								options: this.defaults.sortOrder[key].options,
								value: this.settings.sortOrder[key]
							})).concat(Object.keys(this.defaults.general).map(key => PiAngleLib.ReactUtils.createElement(PiAngleLib.LibraryComponents.SettingsSaveItem, {
								type: "Switch",
								plugin: this,
								keys: ["general", key],
								label: this.defaults.general[key].description,
								value: this.settings.general[key]
							}))).concat(PiAngleLib.ReactUtils.createElement(PiAngleLib.LibraryComponents.SettingsPanelList, {
								title: "Show Channels:",
								children: Object.keys(this.defaults.channels).map(key => PiAngleLib.ReactUtils.createElement(PiAngleLib.LibraryComponents.SettingsSaveItem, {
									type: "Switch",
									plugin: this,
									keys: ["channels", key],
									label: PiAngleLib.LanguageUtils.LanguageStrings[typeNameMap[key]],
									value: this.settings.channels[key]
								}))
							}))
						}));
						
						settingsItems.push(PiAngleLib.ReactUtils.createElement(PiAngleLib.LibraryComponents.CollapseContainer, {
							title: "Server Black List",
							collapseStates: collapseStates,
							children: [
								PiAngleLib.ReactUtils.createElement(PiAngleLib.LibraryComponents.SettingsGuildList, {
									className: PiAngleLib.disCN.marginbottom20,
									disabled: blackList,
									onClick: disabledGuilds => this.saveBlackList(disabledGuilds)
								}),
								PiAngleLib.ReactUtils.createElement(PiAngleLib.LibraryComponents.SettingsItem, {
									type: "Button",
									color: PiAngleLib.LibraryComponents.Button.Colors.GREEN,
									label: "Enable for all Servers",
									onClick: _ => this.batchSetGuilds(settingsPanel, collapseStates, true),
									children: PiAngleLib.LanguageUtils.LanguageStrings.ENABLE
								}),
								PiAngleLib.ReactUtils.createElement(PiAngleLib.LibraryComponents.SettingsItem, {
									type: "Button",
									color: PiAngleLib.LibraryComponents.Button.Colors.PRIMARY,
									label: "Disable for all Servers",
									onClick: _ => this.batchSetGuilds(settingsPanel, collapseStates, false),
									children: PiAngleLib.LanguageUtils.LanguageStrings.DISABLE
								})
							]
						}));
						
						return settingsItems;
					}
				});
			}

			onSettingsClosed () {
				if (this.SettingsUpdated) {
					delete this.SettingsUpdated;
					this.forceUpdateAll();
				}
			}
		
			forceUpdateAll () {				
				hiddenChannelCache = {};

				PiAngleLib.PatchUtils.forceAllUpdates(this);
				PiAngleLib.ChannelUtils.rerenderAll();
			}
		
			onUserContextMenu (e) {
				if (e.subType == "useUserManagementItems" || e.subType == "useMoveUserVoiceItems" || e.subType == "usePreviewVideoItem") {
					let channelId = (PiAngleLib.LibraryModules.VoiceUtils.getVoiceStateForUser(e.instance.props.user.id) || {}).channelId;
					if (channelId && this.isChannelHidden(channelId)) return null;
				}
			}
			
			onChannelContextMenu (e) {
				if (e.instance.props.channel && e.instance.props.channel.guild_id && e.subType == "useChannelMarkAsReadItem") {
					let isHidden = this.isChannelHidden(e.instance.props.channel.id);
					if (isHidden || this.settings.general.showForNormal) {
						if (e.returnvalue.length) e.returnvalue.push(PiAngleLib.ContextMenuUtils.createItem(PiAngleLib.LibraryComponents.MenuItems.MenuSeparator, {}));
						e.returnvalue.push(PiAngleLib.ContextMenuUtils.createItem(PiAngleLib.LibraryComponents.MenuItems.MenuItem, {
							label: this.labels.context_channelaccess,
							id: PiAngleLib.ContextMenuUtils.createItemId(this.name, "permissions"),
							action: _ => this.openAccessModal(e.instance.props.channel, !isHidden)
						}));
					}
				}
			}
			
			onGuildContextMenu (e) {
				if (e.instance.props.guild) {
					let [children, index] = PiAngleLib.ContextMenuUtils.findItem(e.returnvalue, {id: "hide-muted-channels"});
					if (index > -1) children.splice(index + 1, 0, PiAngleLib.ContextMenuUtils.createItem(PiAngleLib.LibraryComponents.MenuItems.MenuCheckboxItem, {
						label: this.labels.context_hidehidden,
						id: PiAngleLib.ContextMenuUtils.createItemId(this.name, "hide-locked-channels"),
						checked: blackList.includes(e.instance.props.guild.id),
						action: value => {
							if (value) blackList.push(e.instance.props.guild.id);
							else PiAngleLib.ArrayUtils.remove(blackList, e.instance.props.guild.id, true);
							this.saveBlackList(PiAngleLib.ArrayUtils.removeCopies(blackList));

							PiAngleLib.PatchUtils.forceAllUpdates(this);
							PiAngleLib.ChannelUtils.rerenderAll(true);
						}
					}));
				}
			}
			
			onGuildHeaderContextMenu (e) {
				this.onGuildContextMenu(e);
			}
			
			processUseInviteItem (e) {
				if (e.instance.props.channel && this.isChannelHidden(e.instance.props.channel.id)) return null;
			}
			
			processChannels (e) {
				if (!e.instance.props.guild || e.instance.props.guild.id.length < 16) return;
				let show = !blackList.includes(e.instance.props.guild.id), sortAtBottom = this.settings.sortOrder.hidden == sortOrders.BOTTOM.value;
				e.instance.props.guildChannels = new e.instance.props.guildChannels.constructor(e.instance.props.guildChannels.id, e.instance.props.guildChannels.hoistedSection.hoistedRows);
				e.instance.props.guildChannels.categories = Object.assign({}, e.instance.props.guildChannels.categories);
				hiddenChannelCache[e.instance.props.guild.id] = [];
				let processCategory = (category, insertChannelless) => {
					if (!category) return;
					let channelArray = PiAngleLib.ObjectUtils.toArray(category.channels);
					if (channelArray.length) {
						for (let n of channelArray) if ((n.renderLevel == renderLevels.CAN_NOT_SHOW || n._hidden) && e.instance.props.selectedVoiceChannelId != n.record.id) {
							if (show && (this.settings.channels[PiAngleLib.DiscordConstants.ChannelTypes[n.record.type]] || this.settings.channels[PiAngleLib.DiscordConstants.ChannelTypes[n.record.type]] === undefined)) {
								n._hidden = true;
								if (e.instance.props.guildChannels.hideMutedChannels && e.instance.props.guildChannels.mutedChannelIds.has(n.record.id)) n.renderLevel = renderLevels.DO_NOT_SHOW;
								else if (category.isCollapsed) n.renderLevel = renderLevels.WOULD_SHOW_IF_UNCOLLAPSED;
								else n.renderLevel = renderLevels.SHOW;
							}
							else {
								delete n._hidden;
								n.renderLevel = renderLevels.CAN_NOT_SHOW;
							}
							
							if (hiddenChannelCache[e.instance.props.guild.id].indexOf(n.record.id) == -1) hiddenChannelCache[e.instance.props.guild.id].push(n.record.id);
						}
						category.shownChannelIds = channelArray.filter(n => n.renderLevel == renderLevels.SHOW).sort((x, y) => {
							let xPos = x.record.position + (x.record.isGuildVocal() ? 1e4 : 0) + (sortAtBottom && x._hidden ? 1e5 : 0);
							let yPos = y.record.position + (y.record.isGuildVocal() ? 1e4 : 0) + (sortAtBottom && y._hidden ? 1e5 : 0);
							return xPos < yPos ? -1 : xPos > yPos ? 1 : 0;
						}).map(n => n.id);
					}
					else if (insertChannelless && !category.shouldShowEmptyCategory()) {
						let shouldShowEmptyCategory = category.shouldShowEmptyCategory;
						category.shouldShowEmptyCategory = PiAngleLib.TimeUtils.suppress((...args) => {
							if (!this.started) {
								category.shouldShowEmptyCategory = shouldShowEmptyCategory;
								return false;
							}
							else return this.settings.channels.GUILD_CATEGORY && !blackList.includes(e.instance.props.guild.id);
						}, "Error in shouldShowEmptyCategory of Category Object!");
					}
				};
				processCategory(e.instance.props.guildChannels.favoritesCategory);
				processCategory(e.instance.props.guildChannels.recentsCategory);
				processCategory(e.instance.props.guildChannels.noParentCategory);
				for (let id in e.instance.props.guildChannels.categories) processCategory(e.instance.props.guildChannels.categories[id], true);
			}
			
			processChannelItem (e) {
				if (e.instance.props.channel && this.isChannelHidden(e.instance.props.channel.id)) {
					if (!e.returnvalue) e.instance.props.className = PiAngleLib.DOMUtils.formatClassName(e.instance.props.className, PiAngleLib.disCN._showhiddenchannelshiddenchannel);
					else {
						let [children, index] = PiAngleLib.ReactUtils.findParent(e.returnvalue, {name: "ChannelItemIcon"});
						let channelChildren = PiAngleLib.ReactUtils.findChild(e.returnvalue, {props: [["className", PiAngleLib.disCN.channelchildren]]});
						if (channelChildren && channelChildren.props && channelChildren.props.children) {
							channelChildren.props.children = [PiAngleLib.ReactUtils.createElement(PiAngleLib.LibraryComponents.TooltipContainer, {
								text: PiAngleLib.LanguageUtils.LanguageStrings.CHANNEL_LOCKED_SHORT,
								children: PiAngleLib.ReactUtils.createElement(PiAngleLib.LibraryComponents.Clickable, {
									className: PiAngleLib.disCN.channeliconitem,
									style: {display: "block"},
									children: PiAngleLib.ReactUtils.createElement(PiAngleLib.LibraryComponents.SvgIcon, {
										className: PiAngleLib.disCN.channelactionicon,
										name: PiAngleLib.LibraryComponents.SvgIcon.Names.LOCK_CLOSED
									})
								})
							})];
						}
						if (!(e.instance.props.channel.type == PiAngleLib.DiscordConstants.ChannelTypes.GUILD_VOICE && e.instance.props.connected)) {
							let wrapper = PiAngleLib.ReactUtils.findChild(e.returnvalue, {props: [["className", PiAngleLib.disCN.channelwrapper]]});
							if (wrapper) {
								wrapper.props.onMouseDown = event => PiAngleLib.ListenerUtils.stopEvent(event);
								wrapper.props.onMouseUp = event => PiAngleLib.ListenerUtils.stopEvent(event);
							}
							let mainContent = PiAngleLib.ReactUtils.findChild(e.returnvalue, {props: [["className", PiAngleLib.disCN.channelmaincontent]]});
							if (mainContent) {
								mainContent.props.onClick = event => PiAngleLib.ListenerUtils.stopEvent(event);
								mainContent.props.href = null;
							}
						}
					}
				}
			}
		
			processVoiceUsers (e) {
				if (!this.settings.general.showVoiceUsers && this.isChannelHidden(e.instance.props.channel.id)) e.instance.props.voiceStates = [];
			}
			
			isChannelHidden (channelId) {
				let channel = PiAngleLib.LibraryModules.ChannelStore.getChannel(channelId);
				if (!channel || !channel.guild_id) return false;
				return hiddenChannelCache[channel.guild_id] && hiddenChannelCache[channel.guild_id].indexOf(channelId) > -1;
			}
			
			batchSetGuilds (settingsPanel, collapseStates, value) {
				if (!value) {
					for (let id of PiAngleLib.LibraryModules.FolderStore.getFlattenedGuildIds()) blackList.push(id);
					this.saveBlackList(PiAngleLib.ArrayUtils.removeCopies(blackList));
				}
				else this.saveBlackList([]);
				PiAngleLib.PluginUtils.refreshSettingsPanel(this, settingsPanel, collapseStates);
			}

			getBlackList () {
				let loadedBlackList = PiAngleLib.DataUtils.load(this, "blacklist");
				return !PiAngleLib.ArrayUtils.is(loadedBlackList) ? [] : loadedBlackList;
			
			}
			
			saveBlackList (savedBlackList) {
				blackList = savedBlackList;
				PiAngleLib.DataUtils.save(savedBlackList, this, "blacklist");
			}
			
			openAccessModal (channel, allowed) {
				let isThread = PiAngleLib.ChannelUtils.isThread(channel);
				let guild = PiAngleLib.LibraryModules.GuildStore.getGuild(channel.guild_id);
				let myMember = guild && PiAngleLib.LibraryModules.MemberStore.getMember(guild.id, PiAngleLib.UserUtils.me.id);
				
				let parentChannel = isThread && PiAngleLib.LibraryModules.ChannelStore.getChannel(PiAngleLib.LibraryModules.ChannelStore.getChannel(channel.id).parent_id);
				let category = parentChannel && parentChannel.parent_id && PiAngleLib.LibraryModules.ChannelStore.getChannel(parentChannel.parent_id) || PiAngleLib.LibraryModules.ChannelStore.getChannel(PiAngleLib.LibraryModules.ChannelStore.getChannel(channel.id).parent_id);
				
				let lightTheme = PiAngleLib.DiscordUtils.getTheme() == PiAngleLib.disCN.themelight;
				
				let addUser = (id, users) => {
					let user = PiAngleLib.LibraryModules.UserStore.getUser(id);
					if (user) users.push(Object.assign({}, user, PiAngleLib.LibraryModules.MemberStore.getMember(guild.id, id) || {}));
					else users.push({id: id, username: `UserId: ${id}`, fetchable: true});
				};
				let checkAllowPerm = permString => {
					return (permString | PiAngleLib.DiscordConstants.Permissions.VIEW_CHANNEL) == permString && (channel.type != PiAngleLib.DiscordConstants.ChannelTypes.GUILD_VOICE || (permString | PiAngleLib.DiscordConstants.Permissions.CONNECT) == permString);
				};
				let checkDenyPerm = permString => {
					return (permString | PiAngleLib.DiscordConstants.Permissions.VIEW_CHANNEL) == permString || (channel.type == PiAngleLib.DiscordConstants.ChannelTypes.GUILD_VOICE && (permString | PiAngleLib.DiscordConstants.Permissions.CONNECT) == permString);
				};
				
				let allowedRoles = [], allowedUsers = [], deniedRoles = [], deniedUsers = [], everyoneDenied = false;
				for (let id in channel.permissionOverwrites) {
					if ((channel.permissionOverwrites[id].type == PiAngleLib.DiscordConstants.PermissionOverrideType.ROLE || overrideTypes[channel.permissionOverwrites[id].type] == PiAngleLib.DiscordConstants.PermissionOverrideType.ROLE) && (guild.roles[id] && guild.roles[id].name != "@everyone") && checkAllowPerm(channel.permissionOverwrites[id].allow)) {
						allowedRoles.push(Object.assign({overwritten: myMember && myMember.roles.includes(id) && !allowed}, guild.roles[id]));
					}
					else if ((channel.permissionOverwrites[id].type == PiAngleLib.DiscordConstants.PermissionOverrideType.MEMBER || overrideTypes[channel.permissionOverwrites[id].type] == PiAngleLib.DiscordConstants.PermissionOverrideType.MEMBER) && checkAllowPerm(channel.permissionOverwrites[id].allow)) {
						addUser(id, allowedUsers);
					}
					if ((channel.permissionOverwrites[id].type == PiAngleLib.DiscordConstants.PermissionOverrideType.ROLE || overrideTypes[channel.permissionOverwrites[id].type] == PiAngleLib.DiscordConstants.PermissionOverrideType.ROLE) && checkDenyPerm(channel.permissionOverwrites[id].deny)) {
						deniedRoles.push(guild.roles[id]);
						if (guild.roles[id] && guild.roles[id].name == "@everyone") everyoneDenied = true;
					}
					else if ((channel.permissionOverwrites[id].type == PiAngleLib.DiscordConstants.PermissionOverrideType.MEMBER || overrideTypes[channel.permissionOverwrites[id].type] == PiAngleLib.DiscordConstants.PermissionOverrideType.MEMBER) && checkDenyPerm(channel.permissionOverwrites[id].deny)) {
						addUser(id, deniedUsers);
					}
				}
				
				if (![].concat(allowedUsers, deniedUsers).find(user => user.id == guild.ownerId)) addUser(guild.ownerId, allowedUsers);
				for (let id in guild.roles) if ((guild.roles[id].permissions | PiAngleLib.DiscordConstants.Permissions.ADMINISTRATOR) == guild.roles[id].permissions && ![].concat(allowedRoles, deniedRoles).find(role => role.id == id)) allowedRoles.push(Object.assign({overwritten: myMember && myMember.roles.includes(id) && !allowed}, guild.roles[id]));
				if (allowed && !everyoneDenied) allowedRoles.push({name: "@everyone"});
				
				let allowedElements = [], deniedElements = [];
				for (let role of allowedRoles) allowedElements.push(PiAngleLib.ReactUtils.createElement(RoleRowComponent, {role: role, guildId: guild.id, channelId: channel.id}));
				for (let user of allowedUsers) allowedElements.push(PiAngleLib.ReactUtils.createElement(UserRowComponent, {user: user, guildId: guild.id, channelId: channel.id}));
				for (let role of deniedRoles) deniedElements.push(PiAngleLib.ReactUtils.createElement(RoleRowComponent, {role: role, guildId: guild.id, channelId: channel.id}));
				for (let user of deniedUsers) deniedElements.push(PiAngleLib.ReactUtils.createElement(UserRowComponent, {user: user, guildId: guild.id, channelId: channel.id}));
				
				const infoStrings = [
					isThread && {
						title: PiAngleLib.LanguageUtils.LanguageStrings.THREAD_NAME,
						text: channel.name
					}, !isThread && {
						title: PiAngleLib.LanguageUtils.LanguageStrings.FORM_LABEL_CHANNEL_NAME,
						text: channel.name
					}, channel.type == PiAngleLib.DiscordConstants.ChannelTypes.GUILD_VOICE ? {
						title: PiAngleLib.LanguageUtils.LanguageStrings.FORM_LABEL_BITRATE,
						text: channel.bitrate || "---"
					} : {
						title: PiAngleLib.LanguageUtils.LanguageStrings.FORM_LABEL_CHANNEL_TOPIC,
						text: PiAngleLib.ReactUtils.markdownParse(channel.topic || "---")
					}, {
						title: PiAngleLib.LanguageUtils.LanguageStrings.CHANNEL_TYPE,
						text: PiAngleLib.LanguageUtils.LanguageStrings[typeNameMap[PiAngleLib.DiscordConstants.ChannelTypes[channel.type]]]
					}, isThread && parentChannel && {
						title: PiAngleLib.LanguageUtils.LanguageStrings.FORM_LABEL_CHANNEL_NAME,
						text: parentChannel.name
					}, {
						title: PiAngleLib.LanguageUtils.LanguageStrings.CATEGORY_NAME,
						text: category && category.name || PiAngleLib.LanguageUtils.LanguageStrings.NO_CATEGORY
					}
				].map((formLabel, i) => formLabel && [
					i == 0 ? null : PiAngleLib.ReactUtils.createElement(PiAngleLib.LibraryComponents.FormComponents.FormDivider, {
						className: PiAngleLib.disCN.marginbottom20
					}),
					PiAngleLib.ReactUtils.createElement(PiAngleLib.LibraryComponents.FormComponents.FormItem, {
						title: `${formLabel.title}:`,
						className: PiAngleLib.DOMUtils.formatClassName(PiAngleLib.disCN.marginbottom20, i == 0 && PiAngleLib.disCN.margintop8),
						children: PiAngleLib.ReactUtils.createElement(PiAngleLib.LibraryComponents.FormComponents.FormText, {
							className: PiAngleLib.disCN.marginleft8,
							children: formLabel.text
						})
					})
				]).flat(10).filter(n => n);

				PiAngleLib.ModalUtils.open(this, {
					size: "MEDIUM",
					header: PiAngleLib.LanguageUtils.LanguageStrings.CHANNEL + " " + PiAngleLib.LanguageUtils.LanguageStrings.ACCESSIBILITY,
					subHeader: "#" + channel.name,
					className: PiAngleLib.disCN._showhiddenchannelsaccessmodal,
					contentClassName: PiAngleLib.DOMUtils.formatClassName(!isThread && PiAngleLib.disCN.listscroller),
					onOpen: modalInstance => {if (modalInstance) accessModal = modalInstance;},
					children: isThread ? infoStrings : [
						PiAngleLib.ReactUtils.createElement(PiAngleLib.LibraryComponents.ModalComponents.ModalTabContent, {
							className: PiAngleLib.disCN.modalsubinner,
							tab: PiAngleLib.LanguageUtils.LanguageStrings.OVERLAY_SETTINGS_GENERAL_TAB,
							children: infoStrings
						}),
						PiAngleLib.ReactUtils.createElement(PiAngleLib.LibraryComponents.ModalComponents.ModalTabContent, {
							tab: this.labels.modal_allowed,
							children: allowedElements.length ? allowedElements :
								PiAngleLib.ReactUtils.createElement(PiAngleLib.LibraryComponents.MessagesPopoutComponents.EmptyStateBottom, {
									msg: PiAngleLib.LanguageUtils.LanguageStrings.AUTOCOMPLETE_NO_RESULTS_HEADER,
									image: lightTheme ? "/assets/9b0d90147f7fab54f00dd193fe7f85cd.svg" : "/assets/308e587f3a68412f137f7317206e92c2.svg"
								})
						}),
						PiAngleLib.ReactUtils.createElement(PiAngleLib.LibraryComponents.ModalComponents.ModalTabContent, {
							tab: this.labels.modal_denied,
							children: deniedElements.length ? deniedElements :
								PiAngleLib.ReactUtils.createElement(PiAngleLib.LibraryComponents.MessagesPopoutComponents.EmptyStateBottom, {
									msg: PiAngleLib.LanguageUtils.LanguageStrings.AUTOCOMPLETE_NO_RESULTS_HEADER,
									image: lightTheme ? "/assets/9b0d90147f7fab54f00dd193fe7f85cd.svg" : "/assets/308e587f3a68412f137f7317206e92c2.svg"
								})
						})
					]
				});
			}

			setLabelsByLanguage () {
				switch (PiAngleLib.LanguageUtils.getLanguage().id) {
					case "bg":		// Bulgarian
						return {
							context_changeorder:				"?????????????? ???? ???????? ???? ???????????????? ????????????",
							context_changeorder_bottom:			"?????????? ?????????????????? ?? ?????????????? ????????",
							context_changeorder_native:			"?????????? ?????????????????? ?? ???????????????? ??????",
							context_channelaccess:				"???????????? ???? ??????????",
							context_hidehidden:					"???????????????? ???? ?????????????????????? ????????????",
							modal_allowed:						"??????????????????",
							modal_denied:						"???????????? ????"
						};
					case "cs":		// Czech
						return {
							context_changeorder:				"Zm??nit po??ad?? skryt??ch kan??l??",
							context_changeorder_bottom:			"Nativn?? kategorie dole",
							context_changeorder_native:			"Nativn?? kategorie ve spr??vn??m po??ad??",
							context_channelaccess:				"P????stup ke kan??lu",
							context_hidehidden:					"Skr??t zam??en?? kan??ly",
							modal_allowed:						"Povoleno",
							modal_denied:						"Odep??eno"
						};
					case "da":		// Danish
						return {
							context_changeorder:				"Skift r??kkef??lge for skjulte kanaler",
							context_changeorder_bottom:			"Indf??dt kategori i bunden",
							context_changeorder_native:			"Native Kategori i korrekt r??kkef??lge",
							context_channelaccess:				"Kanaltilgang",
							context_hidehidden:					"Skjul l??ste kanaler",
							modal_allowed:						"Tilladt",
							modal_denied:						"N??gtet"
						};
					case "de":		// German
						return {
							context_changeorder:				"Reihenfolge der versteckten Kan??le ??ndern",
							context_changeorder_bottom:			"Native Kategorie ganz unten",
							context_changeorder_native:			"Native Kategorie in der richtigen Reihenfolge",
							context_channelaccess:				"Kanalzugriff",
							context_hidehidden:					"Versteckte Kan??le ausblenden",
							modal_allowed:						"Erlaubt",
							modal_denied:						"Verweigert"
						};
					case "el":		// Greek
						return {
							context_changeorder:				"???????????? ???????????? ???????????? ????????????????",
							context_changeorder_bottom:			"?????????????? ?????????????????? ?????? ???????? ??????????",
							context_changeorder_native:			"?????????????? ?????????????????? ???? ?????????? ??????????",
							context_channelaccess:				"???????????????? ????????????????",
							context_hidehidden:					"???????????????? ?????????????????????? ????????????????",
							modal_allowed:						"????????????????????????",
							modal_denied:						"??????????????????????"
						};
					case "es":		// Spanish
						return {
							context_changeorder:				"Cambiar el orden de los canales ocultos",
							context_changeorder_bottom:			"Categor??a nativa en la parte inferior",
							context_changeorder_native:			"Categor??a nativa en el orden correcto",
							context_channelaccess:				"Acceso al canal",
							context_hidehidden:					"Ocultar canales bloqueados",
							modal_allowed:						"Permitido",
							modal_denied:						"Negado"
						};
					case "fi":		// Finnish
						return {
							context_changeorder:				"Muuta piilotettujen kanavien j??rjestyst??",
							context_changeorder_bottom:			"Alkuper??inen luokka alareunassa",
							context_changeorder_native:			"Alkuper??inen luokka oikeassa j??rjestyksess??",
							context_channelaccess:				"Kanavan k??ytt??oikeus",
							context_hidehidden:					"Piilota lukitut kanavat",
							modal_allowed:						"Sallittu",
							modal_denied:						"Kielletty"
						};
					case "fr":		// French
						return {
							context_changeorder:				"Modifier l'ordre des canaux cach??s",
							context_changeorder_bottom:			"Cat??gorie native en bas",
							context_changeorder_native:			"Cat??gorie native dans le bon ordre",
							context_channelaccess:				"Acc??s ?? la cha??ne",
							context_hidehidden:					"Masquer les salons verrouill??es",
							modal_allowed:						"Permis",
							modal_denied:						"Refus??"
						};
					case "hi":		// Hindi
						return {
							context_changeorder:				"???????????? ???????????? ??????????????? ???????????????",
							context_changeorder_bottom:			"???????????? ?????? ?????? ????????? ??????????????????",
							context_changeorder_native:			"????????? ?????????????????? ????????? ???????????? ?????????",
							context_channelaccess:				"???????????? ??????????????????",
							context_hidehidden:					"????????? ???????????? ?????????????????? Hide",
							modal_allowed:						"?????????????????? ??????",
							modal_denied:						"???????????????"
						};
					case "hr":		// Croatian
						return {
							context_changeorder:				"Promijenite redoslijed skrivenih kanala",
							context_changeorder_bottom:			"Izvorna kategorija na dnu",
							context_changeorder_native:			"Izvorna kategorija u ispravnom redoslijedu",
							context_channelaccess:				"Pristup kanalu",
							context_hidehidden:					"Sakrij zaklju??ane kanale",
							modal_allowed:						"Dopu??tena",
							modal_denied:						"Odbijen"
						};
					case "hu":		// Hungarian
						return {
							context_changeorder:				"Rejtett csatorn??k sorrendj??nek m??dos??t??sa",
							context_changeorder_bottom:			"Nat??v kateg??ria az alj??n",
							context_changeorder_native:			"Nat??v kateg??ria helyes sorrendben",
							context_channelaccess:				"Csatorn??hoz val?? hozz??f??r??s",
							context_hidehidden:					"Z??rt csatorn??k elrejt??se",
							modal_allowed:						"Megengedett",
							modal_denied:						"Megtagadva"
						};
					case "it":		// Italian
						return {
							context_changeorder:				"Modifica l'ordine dei canali nascosti",
							context_changeorder_bottom:			"Categoria nativa in basso",
							context_changeorder_native:			"Categoria nativa nell'ordine corretto",
							context_channelaccess:				"Accesso al canale",
							context_hidehidden:					"Nascondi canali bloccati",
							modal_allowed:						"Consentito",
							modal_denied:						"Negato"
						};
					case "ja":		// Japanese
						return {
							context_changeorder:				"?????????????????????????????????????????????",
							context_changeorder_bottom:			"????????????????????????????????????",
							context_changeorder_native:			"?????????????????????????????????????????????",
							context_channelaccess:				"????????????????????????",
							context_hidehidden:					"??????????????????????????????????????????????????????",
							modal_allowed:						"??????",
							modal_denied:						"?????????????????????"
						};
					case "ko":		// Korean
						return {
							context_changeorder:				"????????? ?????? ?????? ??????",
							context_changeorder_bottom:			"????????? ?????? ????????????",
							context_changeorder_native:			"????????? ????????? ???????????? ????????????",
							context_channelaccess:				"?????? ?????????",
							context_hidehidden:					"?????? ?????? ?????????",
							modal_allowed:						"?????????",
							modal_denied:						"?????? ???"
						};
					case "lt":		// Lithuanian
						return {
							context_changeorder:				"Keisti pasl??pt?? kanal?? tvark??",
							context_changeorder_bottom:			"Gimtoji kategorija apa??ioje",
							context_changeorder_native:			"Gimtoji kategorija teisinga tvarka",
							context_channelaccess:				"Prieiga prie kanalo",
							context_hidehidden:					"Sl??pti u??rakintus kanalus",
							modal_allowed:						"Leid??iama",
							modal_denied:						"Paneigta"
						};
					case "nl":		// Dutch
						return {
							context_changeorder:				"Wijzig de volgorde van verborgen kanalen",
							context_changeorder_bottom:			"Native categorie onderaan",
							context_changeorder_native:			"Native categorie in de juiste volgorde",
							context_channelaccess:				"Kanaaltoegang",
							context_hidehidden:					"Verberg vergrendelde kanalen",
							modal_allowed:						"Toegestaan",
							modal_denied:						"Geweigerd"
						};
					case "no":		// Norwegian
						return {
							context_changeorder:				"Endre rekkef??lgen p?? skjulte kanaler",
							context_changeorder_bottom:			"Innf??dt kategori nederst",
							context_changeorder_native:			"Innf??dt kategori i riktig rekkef??lge",
							context_channelaccess:				"Kanaltilgang",
							context_hidehidden:					"Skjul l??ste kanaler",
							modal_allowed:						"Tillatt",
							modal_denied:						"Nektet"
						};
					case "pl":		// Polish
						return {
							context_changeorder:				"Zmie?? kolejno???? ukrytych kana????w",
							context_changeorder_bottom:			"Kategoria natywna na dole",
							context_changeorder_native:			"Kategoria natywna we w??a??ciwej kolejno??ci",
							context_channelaccess:				"Dost??p do kana????w",
							context_hidehidden:					"Ukryj zablokowane kana??y",
							modal_allowed:						"Dozwolony",
							modal_denied:						"Odm??wiono"
						};
					case "pt-BR":	// Portuguese (Brazil)
						return {
							context_changeorder:				"Alterar a ordem dos canais ocultos",
							context_changeorder_bottom:			"Categoria nativa na parte inferior",
							context_changeorder_native:			"Categoria nativa na ordem correta",
							context_channelaccess:				"Acesso ao canal",
							context_hidehidden:					"Ocultar canais bloqueados",
							modal_allowed:						"Permitido",
							modal_denied:						"Negado"
						};
					case "ro":		// Romanian
						return {
							context_changeorder:				"Schimba??i comanda canalelor ascunse",
							context_changeorder_bottom:			"Categorie nativ?? ??n partea de jos",
							context_changeorder_native:			"Categorie nativ?? ??n ordine corect??",
							context_channelaccess:				"Acces la canal",
							context_hidehidden:					"Ascunde??i canalele blocate",
							modal_allowed:						"Permis",
							modal_denied:						"Negat"
						};
					case "ru":		// Russian
						return {
							context_changeorder:				"???????????????? ?????????????? ?????????????? ??????????????",
							context_changeorder_bottom:			"???????????? ?????????????????? ??????????",
							context_changeorder_native:			"?????????????????????? ?????????????????? ?? ???????????????????? ??????????????",
							context_channelaccess:				"???????????? ?? ????????????",
							context_hidehidden:					"???????????? ?????????????????????????????? ????????????",
							modal_allowed:						"??????????????????????",
							modal_denied:						"????????????????"
						};
					case "sv":		// Swedish
						return {
							context_changeorder:				"??ndra ordning f??r dolda kanaler",
							context_changeorder_bottom:			"Naturlig kategori l??ngst ner",
							context_changeorder_native:			"Naturlig kategori i r??tt ordning",
							context_channelaccess:				"Kanaltillg??ng",
							context_hidehidden:					"D??lj l??sta kanaler",
							modal_allowed:						"Till??tet",
							modal_denied:						"F??rnekad"
						};
					case "th":		// Thai
						return {
							context_changeorder:				"?????????????????????????????????????????????????????????????????????????????????",
							context_changeorder_bottom:			"?????????????????????????????????????????????????????????????????????????????????",
							context_changeorder_native:			"???????????????????????????????????????????????????????????????????????????????????????????????????",
							context_channelaccess:				"??????????????????????????????????????????",
							context_hidehidden:					"??????????????????????????????????????????????????????",
							modal_allowed:						"????????????????????????????????????",
							modal_denied:						"???????????????????????????"
						};
					case "tr":		// Turkish
						return {
							context_changeorder:				"Gizli Kanal S??ras??n?? De??i??tir",
							context_changeorder_bottom:			"Altta Yerel Kategori",
							context_changeorder_native:			"Yerel Kategori do??ru s??rada",
							context_channelaccess:				"Kanal Eri??imi",
							context_hidehidden:					"Kilitli Kanallar?? Gizle",
							modal_allowed:						"??zin veriliyor",
							modal_denied:						"Reddedildi"
						};
					case "uk":		// Ukrainian
						return {
							context_changeorder:				"?????????????? ?????????????? ???????????????????? ??????????????",
							context_changeorder_bottom:			"?????????? ?????????????????? ??????????",
							context_changeorder_native:			"?????????? ?????????????????? ?? ?????????????????????? ??????????????",
							context_channelaccess:				"???????????? ???? ????????????",
							context_hidehidden:					"?????????????? ?????????????????????? ????????????",
							modal_allowed:						"??????????????????",
							modal_denied:						"??????????????????????????"
						};
					case "vi":		// Vietnamese
						return {
							context_changeorder:				"Thay ?????i th??? t??? c??c k??nh b??? ???n",
							context_changeorder_bottom:			"Danh m???c G???c ??? d?????i c??ng",
							context_changeorder_native:			"Danh m???c g???c theo ????ng th??? t???",
							context_channelaccess:				"Quy???n truy c???p k??nh",
							context_hidehidden:					"???n c??c k??nh ???? kh??a",
							modal_allowed:						"???????c ph??p",
							modal_denied:						"Ph??? ?????nh"
						};
					case "zh-CN":	// Chinese (China)
						return {
							context_changeorder:				"????????????????????????",
							context_changeorder_bottom:			"?????????????????????",
							context_changeorder_native:			"???????????????????????????",
							context_channelaccess:				"????????????",
							context_hidehidden:					"?????????????????????",
							modal_allowed:						"?????????",
							modal_denied:						"?????????"
						};
					case "zh-TW":	// Chinese (Taiwan)
						return {
							context_changeorder:				"????????????????????????",
							context_changeorder_bottom:			"?????????????????????",
							context_changeorder_native:			"???????????????????????????",
							context_channelaccess:				"????????????",
							context_hidehidden:					"?????????????????????",
							modal_allowed:						"?????????",
							modal_denied:						"?????????"
						};
					default:		// English
						return {
							context_changeorder:				"Change Hidden Channels Order",
							context_changeorder_bottom:			"Native Category at the bottom",
							context_changeorder_native:			"Native Category in correct Order",
							context_channelaccess:				"Channel Access",
							context_hidehidden:					"Hide Locked Channels",
							modal_allowed:						"Permitted",
							modal_denied:						"Denied"
						};
				}
			}
		};
	})(window.PiAngleLib_Global.PluginUtils.buildPlugin(changeLog));
})();
