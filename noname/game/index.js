/**
 * @typedef {{
 * 	cardMove:GameEventPromise[], 
 * 	custom: GameEventPromise[], 
 * 	useCard: GameEventPromise[], 
 * 	changeHp: GameEventPromise[],
 * 	everything: GameEventPromise[] 
 * }} GameHistory
 * @typedef { { type: string, player?: string, content?: string | any[], delay: number } } Video
 * @typedef { { mode: string, name: string[], name1: string, name2?: string, time: number, video: Video, win: boolean } } Videos
*/

import { AI as ai } from '../ai/index.js';
import { Get as get } from '../get/index.js';
import { Library as lib } from '../library/index.js';
import { status as _status } from '../status/index.js';
import { UI as ui } from '../ui/index.js';
import { GNC as gnc } from '../gnc/index.js';
import { userAgent, Uninstantable, GeneratorFunction, AsyncFunction, delay } from "../util/index.js";

import { DynamicStyle } from "./dynamic-style/index.js";
import { GamePromises } from "./promises.js";

export class Game extends Uninstantable {
	static online = false;
	static onlineID = null;
	static onlineKey = null;
	/**
	 * @type {Player[]}
	 */
	static players = [];
	/**
	 * @type {Player[]}
	 */
	static dead = [];
	static imported = [];
	/**
	 * @type { { [key: string]: Player } }
	 */
	static playerMap = {};
	static phaseNumber = 0;
	static roundNumber = 0;
	static shuffleNumber = 0;
	static promises = GamePromises;
	static globalEventHandlers = new class {
		constructor() {
			this._handlers = {};
		}

		getHandler(name, type) {
			if (!type)
				type = this.getDefaultHandlerType(name);
			if (!this._handlers[name])
				return null;
			if (!this._handlers[name][type])
				return null;
			return this._handlers[name][type];
		}

		ensureHandlerList(name, type) {
			if (!type)
				type = this.getDefaultHandlerType(name);
			if (!this._handlers[name])
				this._handlers[name] = {};
			if (!this._handlers[name][type])
				this._handlers[name][type] = [];
			return this._handlers[name][type];
		}

		removeHandler(name, type, func) {
			const list = this.ensureHandlerList(name, type);
			list.remove(func);
			if (list.length == 0) {
				delete this._handlers[name][type];
				if (Object.keys(this._handlers[name]).length == 0) {
					delete this._handlers[name];
				}
			}
		}

		pushHandler(name, type) {
			const args = Array.from(arguments);
			const functions = (typeof type == 'string' ? args.slice(2) : args.slice(1));
			type = (typeof type == 'string' ? type : this.getDefaultHandlerType(name));
			this.ensureHandlerList(name, type).addArray(functions);
		}

		getDefaultHandlerType(name) {
			return `on${name[0].toUpperCase()}${name.slice(1)}`;
		}

		addHandlerToEvent(event) {
			if (typeof event.name != "string") return;
			const handlerMap = this._handlers[event.name];
			if (!handlerMap) return;
			Object.keys(handlerMap).forEach((key) => {
				const list = handlerMap[key];
				if (!list) return;
				list.forEach((handler) => {
					event.pushHandler(key, handler);
				});
			});
		}
	}
	//Stratagem
	//谋攻
	static setStratagemBuffCost(cardName, cost) { return game.broadcastAll((clientCardName, clientCost) => lib.stratagemBuff.cost.set(clientCardName, clientCost), cardName, cost) }
	static setStratagemBuffEffect(cardName, effect) { return game.broadcastAll((clientCardName, clientEffect) => lib.stratagemBuff.cost.set(clientCardName, clientEffect), cardName, effect) }
	static setStratagemBuffPrompt(cardName, prompt) { return game.broadcastAll((clientCardName, clientPrompt) => lib.stratagemBuff.cost.set(clientCardName, clientPrompt), cardName, prompt) }
	/**
	 * 添加新的属性杀
	 */
	static addNature(nature, translation, config) {
		if (!nature) throw new TypeError();
		if (translation && translation.length) lib.translate['nature_' + nature] = translation;
		game.callHook("addNature", [nature, translation, config]);
		return nature;
	}
	/**
	 * 判断卡牌信息/事件是否有某个属性
	 */
	static hasNature(item, nature, player) {
		var natures = get.natureList(item, player);
		if (!nature) return natures.length > 0;
		if (nature == 'linked') return natures.some(n => lib.linked.includes(n));
		return get.is.sameNature(natures, nature);
	}
	/**
	 * 设置卡牌信息/事件的属性
	 */
	static setNature(item, nature, addNature) {
		if (!nature) nature = [];
		if (!addNature) {
			item.nature = get.nature(nature);
			if (!item.nature.length) delete item.nature;
		}
		else {
			let natures = Array.isArray(nature) ? nature : nature.split(lib.natureSeparator);
			let _nature = get.natureList(item, false);
			_nature.addArray(natures);
			item.nature = _nature.join(lib.natureSeparator);
		}
		return item.nature;
	}
	/**
	 * 洗牌
	 */
	static washCard() {
		if (!ui.cardPile.hasChildNodes() && !ui.discardPile.hasChildNodes()) return false;
		if (_status.maxShuffle != undefined) {
			if (_status.maxShuffle == 0) {
				if (_status.maxShuffleCheck) {
					game.over(_status.maxShuffleCheck());
				}
				else {
					game.over('平局');
				}
				return [];
			}
			_status.maxShuffle--;
		}
		game.shuffleNumber++;
		const cards = Array.from(ui.cardPile.childNodes);
		if (_status.discarded) {
			_status.discarded.length = 0;
		}
		for (let i = 0; i < ui.discardPile.childNodes.length; i++) {
			var currentcard = ui.discardPile.childNodes[i];
			currentcard.vanishtag.length = 0;
			currentcard.clearKnowers();
			if (get.info(currentcard).vanish || currentcard.storage.vanish) {
				currentcard.remove();
				continue;
			}
			cards.push(currentcard);
		}
		cards.randomSort();
		return game.cardsGotoPile(cards, 'triggeronly', 'washCard', ['shuffleNumber', game.shuffleNumber])
	}
	/**
	 * 基于钩子的添加势力方法
	 */
	static addGroup(id, short, name, config) {
		if (!id) throw new TypeError();
		if (lib.comparator.typeEquals(short, "object")) {
			config = short;
			short = null;
		}
		if (lib.comparator.typeEquals(name, "object")) {
			config = name;
			name = null;
		}
		if (!lib.comparator.typeEquals(short, "string") && short) {
			name = short;
		}
		lib.group.add(id);
		if (short) lib.translate[id] = short;
		if (name) lib.translate[`${id}2`] = name;
		game.callHook("addGroup", [id, short, name, config]);
		return id;
	}
	/**
	 * 通用的调用钩子函数
	 */
	static callHook(name, args) {
		const callHook = () => {
			for (const hook of lib.hooks[name]) {
				if (hook != null && typeof hook == "function") {
					hook(...args);
				}
			}
		}
		if ("onload" in lib) lib.onload.add(callHook);
		else callHook();
	}
	//Yingbian
	//应变
	static yingbianEffect(event, content) {
		const yingbianEffect = game.createEvent('yingbianEffect');
		yingbianEffect.player = event.player;
		yingbianEffect.card = event.card;
		yingbianEffect._trigger = event;
		yingbianEffect.setContent(content);
		yingbianEffect._args = Array.from(arguments);
		return yingbianEffect;
	}
	static setYingbianConditionColor(yingbianCondition, color) { return game.broadcastAll((yingbianCondition, color) => lib.yingbian.condition.color.set(yingbianCondition, color), yingbianCondition, color) }
	static setComplexYingbianCondition(yingbianCondition, condition) { return game.broadcastAll((yingbianCondition, condition) => lib.yingbian.condition.complex.set(yingbianCondition, condition), yingbianCondition, condition) }
	static setSimpleYingbianCondition(yingbianCondition, condition) { return game.broadcastAll((yingbianCondition, condition) => lib.yingbian.condition.simple.set(yingbianCondition, condition), yingbianCondition, condition) }
	static setYingbianEffect(yingbianEffect, effect) { return game.broadcastAll((yingbianEffect, effect) => lib.yingbian.effect.set(yingbianEffect, effect), yingbianEffect, effect) }
	static setYingbianPrompt(yingbian, prompt) { return game.broadcastAll((yingbian, prompt) => lib.yingbian.prompt.set(yingbian, prompt), yingbian, prompt) }
	/**
	 * Dynamic Style Manager
	 * 动态CSS管理对象
	 * 
	 * > No idea to write, it's just a tool to handle css.
	 * > 暂时不知道写啥，反正就是个管CSS的工具
	 * 
	 * @example
	 * // 为符合".content"的元素增加"text-align: center"的样式
	 * game.dynamicStyle.add(".content", {
	 * 	textAlign: "center"
	 * });
	 * 
	 * // 在上一条的基础上，再为".content"增加"color: #FFFFFF"的样式
	 * game.dynamicStyle.add(".content", {
	 * 	color: "#FFFFFF"
	 * });
	 * 
	 * @example
	 * // 批量添加符合对应选择器元素的样式
	 * game.dynamicStyle.addObject({
	 * 	".content": {
	 * 		textAlign: "center"
	 * 	},
	 * 	".ansory": {
	 * 		fontSize: "16px"
	 * 	}
	 * });
	 * 
	 * @example
	 * // 移除".content"元素的样式
	 * game.dynamicStyle.remove(".content");
	 * 
	 * @example
	 * // 移除".content"元素的"textAlign"样式
	 * game.dynamicStyle.removeStyles(".content", ["textAligh"]);
	 * 
	 * @example
	 * // 如果".content"元素的样式存在，则将".content"的样式修改为给定的样式
	 * // 反之效果同`game.dynamicStyle.add`
	 * game.dynamicStyle.update(".content", {
	 * 	textAlign: "center"
	 * });
	 */
	static dynamicStyle = new DynamicStyle()
	/**
	 * Add a background music to the config option
	 * 
	 * 在设置选项中添加一首背景音乐
	 */
	static addBackgroundMusic(link, musicName, aozhan) {
		const backgroundMusicSetting = ui[aozhan ? 'aozhan_bgm' : 'background_music_setting'], menu = backgroundMusicSetting._link.menu, config = backgroundMusicSetting._link.config;
		if (typeof musicName != 'string') musicName = link;
		if (aozhan) lib.mode.guozhan.config.aozhan_bgm.item[link] = musicName;
		else lib.config.all.background_music.add(link);
		config.item[link] = musicName;
		const textMenu = ui.create.div('', musicName, menu, function () {
			const node = this.parentNode._link, config = node._link.config;
			node._link.current = this.link;
			const tmpName = node.lastChild.innerHTML;
			node.lastChild.innerHTML = config.item[this._link];
			if (config.onclick && config.onclick.call(node, this._link, this) === false) node.lastChild.innerHTML = tmpName;
			if (config.update) config.update();
		}, menu.childElementCount - 2);
		textMenu._link = link;
		config.updatex.call(backgroundMusicSetting, []);
	}
	/**
	 * Remove a background music from the config option
	 * 
	 * 从设置选项中移除一首背景音乐
	 */
	static removeBackgroundMusic(link, aozhan) {
		if (aozhan) {
			if (['disabled', 'random'].includes(link)) return;
			delete lib.mode.guozhan.config.aozhan_bgm.item[link];
			if (!Array.isArray(_status.aozhanBGMToRemove)) _status.aozhanBGMToRemove = [];
			_status.aozhanBGMToRemove.add(link);
		}
		else {
			if (['music_off', 'music_custom', 'music_random'].includes(link)) return;
			lib.config.all.background_music.remove(link);
		}
		const backgroundMusicSetting = ui[aozhan ? 'aozhan_bgm' : 'background_music_setting'], config = backgroundMusicSetting._link.config;
		config.updatex.call(backgroundMusicSetting, []);
	}
	static updateBackground() {
		const background = _status.tempBackground || lib.config.image_background;
		ui.background.delete();
		const uiBackground = ui.background = ui.create.div('.background'), style = uiBackground.style;
		if (lib.config.image_background_blur) {
			style.filter = 'blur(8px)';
			style.webkitFilter = 'blur(8px)';
			style.transform = 'scale(1.05)';
		}
		document.body.insertBefore(uiBackground, document.body.firstChild);
		if (background.startsWith('db:')) uiBackground.setBackgroundDB(background.slice(3));
		else if (background.startsWith('ext:')) uiBackground.setBackgroundImage(`extension/${background.slice(4)}`);
		else if (background == 'default') {
			uiBackground.addTempClass('start');
			style.backgroundImage = 'none';
		}
		else if (background.startsWith('custom_')) {
			style.backgroundImage = 'none';
			game.getDB('image', background).then(fileToLoad => {
				if (!fileToLoad) return;
				const fileReader = new FileReader();
				fileReader.onload = fileLoadedEvent => style.backgroundImage = `url(${fileLoadedEvent.target.result})`;
				fileReader.readAsDataURL(fileToLoad, "UTF-8");
			});
		}
		else uiBackground.setBackgroundImage(`image/background/${background}.jpg`);
		style.backgroundSize = 'cover';
		style.backgroundPosition = '50% 50%';
	}
	/**
	 * Generate a beatmap using the given BPM, beats, and offset
	 * 
	 * 用给定的BPM、节拍和偏移生成谱面
	 */
	static generateBeatmapTimeleap(bpm, beats, offset) { return beats.map(value => Math.round(value * 60000 / bpm + (offset || 0))) }
	static updateRenku() {
		game.broadcast(function (renku) {
			_status.renku = renku;
		}, _status.renku);
		for (var i of game.players) {
			if (i.storage.renku) i.markSkill('renku');
		}
	}
	/**
	 * 为牌添加知情者
	 * @param { Card[] | Card } cards 
	 * @param { Player[] } players 
	 */
	static addCardKnower(cards, players) {
		if (get.itemtype(cards) == 'card') {
			// @ts-ignore
			cards = [cards];
		}
		// @ts-ignore
		cards.forEach(card => card.addKnower(players));
	}
	/**
	 * 移除牌的所有知情者。
	 * @param { Card[] | Card } cards
	 */
	static clearCardKnowers(cards) {
		// @ts-ignore
		if (get.itemtype(cards) == 'card') {
			// @ts-ignore
			cards = [cards];
		}
		// @ts-ignore
		cards.forEach(card => card.clearKnowers());
	}
	/**
	 * @param { { [key: string]: any } } [arg]
	 */
	static loseAsync(arg) {
		var next = game.createEvent('loseAsync');
		next.forceDie = true;
		next.getd = function (player, key, position) {
			if (!position) position = ui.discardPile;
			if (!key) key = 'cards';
			var cards = [], event = this;
			game.checkGlobalHistory('cardMove', function (evt) {
				if (evt.name != 'lose' || evt.position != position || evt.getParent() != event) return;
				if (player && player != evt.player) return;
				cards.addArray(evt[key]);
			});
			return cards;
		};
		next.getl = function (player) {
			const that = this;
			const map = {
				player: player,
				hs: [],
				es: [],
				js: [],
				ss: [],
				xs: [],
				cards: [],
				cards2: [],
				gaintag_map: {},
			};
			player.checkHistory('lose', function (evt) {
				if (evt.parent == that) {
					map.hs.addArray(evt.hs);
					map.es.addArray(evt.es);
					map.js.addArray(evt.js);
					map.ss.addArray(evt.ss);
					map.xs.addArray(evt.xs);
					map.cards.addArray(evt.cards);
					map.cards2.addArray(evt.cards2);
					for (let key in evt.gaintag_map) {
						if (!map.gaintag_map[key]) map.gaintag_map[key] = [];
						map.gaintag_map[key].addArray(evt.gaintag_map[key]);
					}
				}
			});
			return map;
		};
		next.getg = function (player) {
			var that = this;
			var cards = [];
			player.checkHistory('gain', function (evt) {
				if (evt.parent == that) {
					cards.addArray(evt.cards);
				}
			});
			return cards;
		};
		if (arg && get.is.object(arg)) {
			for (var i in arg) next[i] = arg[i];
		}
		return next;
	}
	static callFuncUseStepCache(prefix, func, params) {
		if (typeof func != 'function') return;
		if (_status.closeStepCache || !_status.event) return func.apply(null, params);
		var cacheKey = "[" + prefix + "]" + get.paramToCacheKey.apply(null, params);
		var ret = _status.event.getStepCache(cacheKey);
		if (ret === undefined || ret === null) {
			ret = func.apply(null, params);
			_status.event.putStepCache(cacheKey, ret);
		}
		return ret;
	}
	/**
	 * @param {string} name 
	 */
	static getRarity(name) {
		var rank = lib.rank.rarity;
		if (rank.legend.includes(name)) return 'legend';
		if (rank.epic.includes(name)) return 'epic';
		if (rank.rare.includes(name)) return 'rare';
		if (get.mode() != 'chess' && rank.junk.includes(name)) return 'junk';
		return 'common';
	}
	/**
	 * @template { keyof GameHistory } T
	 * @param { T } key
	 * @param { (event: GameEventPromise) => boolean } filter
	 * @param { GameEventPromise } [last]
	 * @returns { boolean }
	 */
	static hasGlobalHistory(key, filter, last) {
		// md谁写的和getGlobalHistory一样？害人！
		if (!key || !filter) return false;
		else {
			const history = game.getGlobalHistory(key);
			if (last) {
				const lastIndex = history.indexOf(last);
				return history.some((event, index) => {
					if (index > lastIndex) return false;
					return filter(event);
				});
			}
			else {
				return history.some(filter);
			}
		}
	}
	/**
	 * @template { keyof GameHistory } T
	 * @param { T } key
	 * @param { (event: GameEventPromise) => boolean } filter
	 * @param { GameEventPromise } [last] 
	 * @returns { void }
	 */
	static checkGlobalHistory(key, filter, last) {
		// md谁写的和getGlobalHistory一样？害人！
		if (!key || !filter) return;
		else {
			const history = game.getGlobalHistory(key);
			if (last) {
				const lastIndex = history.indexOf(last);
				history.forEach((event, index) => {
					if (index > lastIndex) return false;
					return filter(event);
				});
			}
			else {
				history.forEach(filter);
			}
		}
	}
	/**
	 * @overload
	 * @returns { GameHistory }
	 */
	/**
	 * @template { keyof GameHistory } T
	 * @overload
	 * @param { T } key
	 * @param { (event: GameEventPromise) => boolean } [filter]
	 * @param { GameEventPromise } [last] 
	 * @returns { GameHistory[T] }
	 */
	static getGlobalHistory(key, filter, last) {
		if (!key) return _status.globalHistory[_status.globalHistory.length - 1];
		if (!filter) return _status.globalHistory[_status.globalHistory.length - 1][key];
		else {
			const history = game.getGlobalHistory(key);
			if (last) {
				const lastIndex = history.indexOf(last);
				return history.filter((event, index) => {
					if (index > lastIndex) return false;
					return filter(event);
				})
			}
			return history.filter(filter);
		}
	}
	/**
	 * @template { keyof GameHistory } T
	 * @param { T } key
	 * @param { (event: GameEventPromise) => boolean } filter
	 * @param { GameEventPromise } [last] 
	 * @returns { boolean }
	 */
	static hasAllGlobalHistory(key, filter, last) {
		if (!key || !filter) return false;
		return _status.globalHistory.some(value => {
			if (value[key]) {
				if (last && value[key].includes(last)) {
					const lastIndex = value[key].indexOf(last);
					if (value[key].some((event, index) => {
						if (index > lastIndex) return false;
						return filter(event);
					})) return true;
				}
				else {
					if (value[key].some(filter)) return true;
				}
			}
		})
	}
	/**
	 * @template { keyof GameHistory } T
	 * @param { T } key
	 * @param { (event: GameEventPromise) => boolean } filter
	 * @param { GameEventPromise } [last] 
	 * @returns { void }
	 */
	static checkAllGlobalHistory(key, filter, last) {
		if (!key || !filter) return;
		let stopped = false;
		_status.globalHistory.forEach(value => {
			if (value[key]) {
				if (last && value[key].includes(last) && !stopped) {
					stopped = true;
					const lastIndex = value[key].indexOf(last);
					value[key].forEach((event, index) => {
						if (index > lastIndex) return false;
						return filter(event);
					});
				}
				else {
					value[key].forEach(filter);
				}
			}
		})
	}
	/**
	 * @overload
	 * @returns { GameHistory[] }
	 */
	/**
	 * @template { keyof GameHistory } T
	 * @overload
	 * @param { T } key
	 * @param { (event: GameEventPromise) => boolean } [filter]
	 * @param { GameEventPromise } [last] 
	 * @returns { GameHistory[T] }
	 */
	static getAllGlobalHistory(key, filter, last) {
		const history = [];
		_status.globalHistory.forEach(value => {
			if (!key || !value[key]) {
				history.push(value);
			}
			else {
				history.push(...value[key]);
			}
		})
		if (filter) {
			if (last) {
				const lastIndex = history.indexOf(last);
				return history.filter((event, index) => {
					if (index > lastIndex) return false;
					return filter(event);
				});
			}
			return history.filter(filter);
		}
		return history;
	}
	/**
	 * @overload
	 * @returns { void }
	 */
	/**
	 * @overload
	 * @param { Card } cards 
	 * @returns { GameEventPromise }
	 */
	/**
	 * @overload
	 * @param {Card[]} cards 
	 * @returns { GameEventPromise }
	 */
	static cardsDiscard(cards) {
		/** @type { 'cards' | 'card' | void } */
		// @ts-ignore
		var type = get.itemtype(cards);
		if (type != 'cards' && type != 'card') return;
		var next = game.createEvent('cardsDiscard');
		// @ts-ignore
		next.cards = type == 'cards' ? cards.slice(0) : [cards];
		next.setContent('cardsDiscard');
		next.getd = function (player, key, position) {
			return this.cards.slice(0);
		};
		return next;
	}
	/**
	 * @overload
	 * @returns { void }
	 */
	/**
	 * @overload
	 * @param { Card } cards 
	 * @returns { GameEventPromise }
	 */
	/**
	 * @overload
	 * @param {Card[]} cards 
	 * @returns { GameEventPromise }
	 */
	static cardsGotoOrdering(cards) {
		/** @type { 'cards' | 'card' | void } */
		// @ts-ignore
		var type = get.itemtype(cards);
		if (type != 'cards' && type != 'card') return;
		var next = game.createEvent('cardsGotoOrdering');
		next.cards = type == 'cards' ? cards.slice(0) : [cards];
		next.setContent('cardsGotoOrdering');
		return next;
	}
	/**
	 * @overload
	 * @returns { void }
	 */
	/**
	 * @overload
	 * @param { Card } cards 
	 * @param { 'toRenku' | false } [bool] 为false时不触发trigger，为'toRenku'时牌放到仁库
	 * @returns { GameEventPromise }
	 */
	/**
	 * @overload
	 * @param {Card[]} cards 
	 * @param { 'toRenku' | false } [bool] 为false时不触发trigger，为'toRenku'时牌放到仁库
	 * @returns { GameEventPromise }
	 */
	static cardsGotoSpecial(cards, bool) {
		/** @type { 'cards' | 'card' | void } */
		// @ts-ignore
		var type = get.itemtype(cards);
		if (type != 'cards' && type != 'card') return;
		var next = game.createEvent('cardsGotoSpecial');
		next.cards = type == 'cards' ? cards.slice(0) : [cards];
		if (bool == 'toRenku') next.toRenku = true;
		else if (bool === false) next.notrigger = true;
		next.setContent('cardsGotoSpecial');
		return next;
	}
	/**
	 * 
	 * @param {...(
	 * 	Card[] | 
	 * 	Card | 
	 * 	Function |
	 * 	'insert' | 'washCard' | 'triggeronly' |
	 * 	[string, any]
	 * )} args 
	 * @returns 
	 */
	static cardsGotoPile(...args) {
		/**
		 * @type { Card[] }
		 */
		const cards = [];
		const next = game.createEvent('cardsGotoPile');
		next.cards = cards;
		for (let i = 0; i < args.length; i++) {
			// @ts-ignore
			let arg = args[i], itemtype = get.itemtype(arg);
			if (itemtype == 'cards') {
				cards.addArray(arg);
			}
			else if (itemtype == 'card') {
				cards.add(arg);
			}
			else if (typeof arg == 'function') {
				next.insert_index = arg;
			}
			else if (typeof arg == 'string') {
				if (arg == 'insert') next.insert_card = true;
				else if (arg == 'washCard') next.washCard = true;
				else if (arg == 'triggeronly') next._triggeronly = true;
			}
			else if (Array.isArray(arg) && arg.length == 2 && typeof arg[0] == 'string') {
				next.set(arg[0], arg[1]);
			}
		}
		if (!cards.length) {
			_status.event.next.remove(next);
		}
		else {
			next.setContent('cardsGotoPile');
			if (next._triggeronly) game.$cardsGotoPile(next);
		}
		return next;
	}
	/**
	 * @param { GameEventPromise } event 
	 */
	static $cardsGotoPile(event) {
		const cards = event.cards;
		const pile = ui.cardPile;
		for (let i = 0; i < cards.length; i++) {
			if (cards[i].willBeDestroyed('cardPile', null, event)) {
				cards[i].selfDestroy(event);
				continue;
			}
			if (event.insert_index) {
				cards[i].fix();
				pile.insertBefore(cards[i], event.insert_index(event, cards[i]));
			}
			else if (event.insert_card) {
				cards[i].fix();
				pile.insertBefore(cards[i], pile.firstChild);
			}
			else {
				cards[i].fix();
				pile.appendChild(cards[i]);
			}
		}
		game.updateRoundNumber();
	}
	/**
	 * @param { false } [pause] 
	 */
	static showHistory(pause) {
		if (lib.config.show_history == 'left') {
			ui.window.classList.add('leftbar');
		}
		else if (lib.config.show_history == 'right') {
			ui.window.classList.add('rightbar');
		}
		if (pause != false && ui.pause) {
			ui.pause.show();
		}
	}
	/**
	 * @param { string } src 
	 * @param { true } [blur] 
	 */
	static createBackground(src, blur) {
		const current = document.body.querySelector('.background.upper');
		if (current) current.delete();
		const node = ui.create.div('.background.blurbg', document.body);
		node.setBackgroundImage(src);
		node.style.backgroundSize = 'cover';
		if (blur) node.classList.add('paused');
		return node;
	}
	/**
	 * 
	 * @param { string } url 
	 * @param { Player } [player] 
	 */
	static changeLand(url, player) {
		game.addVideo('changeLand', player, url);
		const parsedPath = lib.path.parse(url);
		// @ts-ignore
		delete parsedPath.base;
		if (!parsedPath.dir) parsedPath.dir = 'image/card/';
		if (!parsedPath.ext) parsedPath.ext = '.jpg';
		const fileName = parsedPath.name;
		game.broadcastAll((formattedPath, name, skill, player) => {
			const node = ui.create.div('.background.upper.land');
			node.setBackgroundImage(formattedPath);
			node.destroy = () => {
				if (node.skill) {
					game.removeGlobalSkill(node.skill);
					if (node.system) node.system.remove();
				}
				node.classList.add('hidden');
				setTimeout(() => node.remove(), 3000);
				if (ui.land == node) ui.land = null;
			}
			if (ui.land) {
				document.body.insertBefore(node, ui.land);
				ui.land.destroy();
			}
			else {
				node.classList.add('hidden');
				document.body.insertBefore(node, ui.window);
				ui.refresh(node);
				node.classList.remove('hidden');
			}
			ui.land = node;
			if (!name) return;
			node.name = name;
			node.skill = skill;
			if (player) {
				node.player = player;
				player.addTempSkill('land_used');
			}
			lib.setPopped(node.system = ui.create.system(lib.translate[skill], null, true, true), () => {
				const uiIntro = ui.create.dialog('hidden');
				uiIntro.addText(player ? `来源：${get.translation(player)}` : '地图').style.margin = '0';
				uiIntro._place_text = uiIntro.add(ui.create.div('.text', lib.translate[`${skill}_info`]));
				uiIntro.add(ui.create.div('.placeholder.slim'));
				return uiIntro;
			}, 200);
			game.addGlobalSkill(skill);
		}, lib.path.format(parsedPath), fileName, `${fileName}_skill`, player);
	}
	/**
	 * @param { string[] } updates 
	 * @param { Function } proceed 
	 */
	static checkFileList(updates, proceed) {
		let n = updates.length;
		if (!n) {
			proceed(n);
		}
		for (let i = 0; i < updates.length; i++) {
			if (lib.node && lib.node.fs) {
				lib.node.fs.access(__dirname + '/' + updates[i], (function (entry) {
					return function (err) {
						if (!err) {
							let stat = lib.node.fs.statSync(__dirname + '/' + entry);
							if (stat.size == 0) {
								err = true;
							}
						}
						if (err) {
							n--;
							if (n == 0) {
								proceed();
							}
						}
						else {
							n--;
							updates.remove(entry);
							if (n == 0) {
								proceed();
							}
						}
					}
				}(updates[i])));
			}
			else {
				resolveLocalFileSystemURL(lib.assetURL + updates[i], (function (name) {
					return function (entry) {
						n--;
						updates.remove(name);
						if (n == 0) {
							proceed();
						}
					}
				}(updates[i])), function () {
					n--;
					if (n == 0) {
						proceed();
					}
				});
			}
		}
	}
	/**
	 * @param  {...(Player[] | Player)} args 
	 */
	static replaceHandcards(...args) {
		var next = game.createEvent('replaceHandcards');
		if (Array.isArray(args[0])) {
			next.players = args[0];
		}
		else {
			next.players = [];
			for (var i = 0; i < args.length; i++) {
				// @ts-ignore
				if (get.itemtype(args[i]) == 'player') {
					next.players.push(args[i]);
				}
			}
		}
		if (_status.connectMode) {
			next.setContent('replaceHandcardsOL');
		}
		else {
			next.setContent('replaceHandcards');
		}
	}
	/**
	 * @param { string } name 
	 */
	static removeCard(name) {
		for (var i = 0; i < lib.card.list.length; i++) {
			if (lib.card.list[i][2] == name) {
				lib.card.list.splice(i--, 1);
			}
		}
		var list = [];
		for (var i = 0; i < ui.cardPile.childElementCount; i++) {
			if (ui.cardPile.childNodes[i].name == name) {
				list.push(ui.cardPile.childNodes[i]);
			}
		}
		for (var i = 0; i < list.length; i++) {
			list[i].remove();
		}
	}
	/**
	 * @param { 'hidden' } [type] 
	 */
	static randomMapOL(type) {
		if (type == 'hidden') {
			ui.arena.classList.add('playerhidden');
		}
		game.prepareArena();
		if (window.isNonameServer) {
			game.me = ui.create.player();
		}
		let list = [];
		for (let i = 0; i < game.players.length; i++) {
			if (game.players[i] != game.me) {
				list.push(game.players[i]);
			}
		}
		let map = [];
		for (let i = 0; i < lib.node.clients.length; i++) {
			if (!list.length) break;
			const current = list.randomRemove();
			current.ws = lib.node.clients[i];
			current.playerid = current.ws.id;
			current.nickname = current.ws.nickname;
			current.setNickname();
		}
		if (!window.isNonameServer) {
			game.me.playerid = get.id();
			game.me.nickname = get.connectNickname();
			game.me.setNickname();
		}
		for (let i = 0; i < game.players.length; i++) {
			if (!game.players[i].playerid) {
				game.players[i].playerid = get.id();
			}
			map.push([game.players[i].playerid, game.players[i].nickname]);
			lib.playerOL[game.players[i].playerid] = game.players[i];
		}
		game.broadcast(function (map, config, hidden) {
			if (hidden) {
				ui.arena.classList.add('playerhidden');
			}
			lib.configOL = config;
			ui.create.players();
			ui.create.me();
			game.me.playerid = game.onlineID;
			game.me.nickname = get.connectNickname();
			for (let i = 0; i < map.length; i++) {
				if (map[i][0] == game.me.playerid) {
					map = map.concat(map.splice(0, i));
					break;
				}
			}
			for (let i = 0; i < game.players.length; i++) {
				game.players[i].playerid = map[i][0];
				game.players[i].nickname = map[i][1];
				game.players[i].setNickname();
				lib.playerOL[game.players[i].playerid] = game.players[i];
			}
			_status.mode = lib.configOL[lib.configOL.mode + '_mode'];
		}, map, lib.configOL, type == 'hidden');
		_status.mode = lib.configOL[lib.configOL.mode + '_mode'];
		game.chooseCharacterOL();
	}
	static closeMenu() {
		if (ui.menuContainer && !ui.menuContainer.classList.contains('hidden')) {
			ui.click.configMenu();
		}
	}
	static closeConnectMenu() {
		if (ui.connectMenuContainer && !ui.connectMenuContainer.classList.contains('hidden')) {
			ui.click.connectMenu();
		}
	}
	static closePopped() {
		if (ui.currentpopped) {
			if (ui.currentpopped._uiintro) {
				ui.currentpopped._uiintro.delete();
				delete ui.currentpopped._uiintro;
			}
			delete ui.currentpopped;
		}
	}
	/**
	 * @template { keyof typeof lib.message.client } T
	 * @overload
	 * @param { T } func
	 * @param { ...Parameters<typeof lib.message.client[T]> } args
	 * @returns { void }
	 */
	/**
	 * @template { any[] } T
	 * @overload
	 * @param { (...args: T) => void } func
	 * @param { ...T } args
	 * @returns { void }
	 */
	static broadcast(func, ...args) {
		if (!lib.node || !lib.node.clients || game.online) return;
		for (var i = 0; i < lib.node.clients.length; i++) {
			if (lib.node.clients[i].inited) {
				lib.node.clients[i].send.apply(lib.node.clients[i], arguments);
			}
		}
	}
	/**
	 * @template { keyof typeof lib.message.client } T
	 * @overload
	 * @param { T } func
	 * @param { ...Parameters<typeof lib.message.client[T]> } args
	 * @returns { void }
	 */
	/**
	 * @template { any[] } T
	 * @overload
	 * @param { (...args: T) => void } func
	 * @param { ...T } args
	 * @returns { void }
	 */
	static broadcastAll(func, ...args) {
		if (game.online) return;
		game.broadcast.apply(this, arguments);
		if (typeof func == 'string') {
			func = lib.message.client[func];
		}
		if (typeof func == 'function') {
			func.apply(this, args);
		}
	}
	static syncState() {
		let state = null;
		if (game.getState) {
			state = game.getState();
		}
		game.broadcast(function (state, current, number) {
			if (game.updateState && state) game.updateState(state);
			_status.currentPhase = current;
			game.phaseNumber = number;
		}, state, _status.currentPhase, game.phaseNumber);
	}
	static updateWaiting() {
		const map = [];
		for (let i = 0; i < game.connectPlayers.length; i++) {
			const player = game.connectPlayers[i];
			if (player.playerid) {
				if (!game.onlinezhu) {
					game.onlinezhu = player.playerid;
					game.send('server', 'changeAvatar', player.nickname, player.avatar);
					_status.onlinenickname = player.nickname;
					_status.onlineavatar = player.avatar;
				}
				map[i] = [player.nickname, player.avatar, player.playerid];
				if (player.playerid == game.onlinezhu) {
					map[i].push('zhu');
				}
			}
			else if (player.classList.contains('unselectable2')) {
				map[i] = 'disabled';
			}
			else {
				map[i] = null;
			}
		}
		game.broadcast('updateWaiting', map);
	}
	/**
	 * @param { Function } func 
	 */
	static waitForPlayer(func) {
		var next = game.createEvent('waitForPlayer', false);
		next.func = func;
		next.setContent('waitForPlayer');
	}
	/**
	 * @param { number } time 
	 * @param { Function } [onEnd] 
	 */
	static countDown(time, onEnd) {
		// @ts-ignore
		time = parseInt(time);
		if (!time) return;
		if (time <= 0) return;
		let current = time;
		ui.timer.set(current, 1);
		_status.countDown = setInterval(function () {
			if (--current) {
				ui.timer.set(current, current / time);
			}
			else {
				ui.timer.set(0, 0);
				clearInterval(_status.countDown);
				delete _status.countDown;
				if (onEnd) onEnd();
			}
		}, 1000);
	}
	static countChoose(clear) {
		if (_status.imchoosing) return;
		_status.imchoosing = true;
		if (_status.connectMode && !_status.countDown) {
			ui.timer.show();
			let num;
			//这么一大行都是为了祢衡
			if (_status.event && _status.event.name == 'chooseToUse' && _status.event.type == 'phase' &&
				_status.event.player && _status.event.player.forceCountChoose &&
				typeof _status.event.player.forceCountChoose.phaseUse == 'number') {
				num = _status.event.player.forceCountChoose.phaseUse;
			}
			else if (_status.connectMode) {
				num = lib.configOL.choose_timeout;
			}
			else {
				num = get.config('choose_timeout');
			}
			game.countDown(parseInt(num), () => {
				ui.click.auto();
				ui.timer.hide();
			});
			if (!game.online && game.me) {
				if (_status.event.getParent().skillHidden) {
					for (let i = 0; i < game.players.length; i++) {
						game.players[i].showTimer();
					}
					game.me._hide_all_timer = true;
				}
				else if (!_status.event._global_waiting) {
					game.me.showTimer();
				}
			}
		}
		else if (_status.event.player.forceCountChoose && _status.event.isMine() && !_status.countDown) {
			let info = _status.event.player.forceCountChoose;
			let num;
			if (_status.event.name == 'chooseToUse' && _status.event.type == 'phase' && typeof info.phaseUse == 'number') {
				num = info.phaseUse;
			}
			else if (typeof info[_status.event.name] == 'number') {
				num = info[_status.event.name]
			}
			else if (info.default) {
				num = info.default;
			}
			else return;
			let finish = function () {
				if (_status.event.endButton) {
					if (_status.event.skill) {
						ui.click.cancel();
					}
					ui.click.cancel();
				}
				else {
					if (ui.confirm && ui.confirm.str) {
						if (ui.confirm.str.includes('c')) {
							ui.click.cancel();
						}
						else if (ui.confirm.str.includes('o')) {
							ui.click.ok();
						}
					}
					else if (['chooseControl', 'chooseBool'].includes(_status.event.name) && _status.paused) {
						_status.event.result = 'ai';
						game.resume();
					}
					else {
						ui.click.auto('forced');
						setTimeout(() => {
							ui.click.auto('forced');
						}, 200);
					}
				}
				ui.timer.hide();
			};
			if (!num) {
				ui.timer.hide();
				game.uncheck();
				setTimeout(finish, 200);
			}
			else {
				ui.timer.show();
				game.countDown(num, finish);
			}
		}
	}
	static stopCountChoose() {
		if (_status.countDown) {
			clearInterval(_status.countDown);
			delete _status.countDown;
			ui.timer.hide();
		}
		if (_status.connectMode && !game.online && game.me) {
			if (game.me._hide_all_timer) {
				delete game.me._hide_all_timer;
				for (let i = 0; i < game.players.length; i++) {
					game.players[i].hideTimer();
				}
			}
			else if (!_status.event._global_waiting) {
				game.me.hideTimer();
			}
		}
	}
	/**
	 * @param { string } ip 
	 * @param { (result: boolean) => any } callback 
	 */
	static connect(ip, callback) {
		if (game.online) return;
		let withport = false;
		let index = ip.lastIndexOf(':');
		if (index != -1) {
			index = parseFloat(ip.slice(index + 1));
			if (index && Math.floor(index) == index) {
				withport = true;
			}
		}
		if (!withport) ip = ip + ':8080';
		_status.connectCallback = callback;
		try {
			if (game.ws) {
				game.ws._nocallback = true;
				game.ws.close();
				delete game.ws;
			}
			let str = '';
			if (!ip.startsWith('wss://') && !ip.startsWith('ws://')) str = (get.config('wss_mode', 'connect') ? 'wss://' : 'ws://');
			game.ws = new WebSocket(str + ip + '');
		}
		// 今天狂神龙尊来了这里也没有参数
		catch {
			alert('错误：无效联机地址');
			if (callback) callback(false);
			return;
		}
		game.ws.onopen = lib.element.ws.onopen;
		game.ws.onmessage = lib.element.ws.onmessage;
		game.ws.onerror = lib.element.ws.onerror;
		game.ws.onclose = lib.element.ws.onclose;
		_status.ip = ip;
	}
	static send() {
		if (game.observe && arguments[0] != 'reinited') return;
		if (game.ws) {
			const args = Array.from(arguments);
			if (typeof args[0] == 'function') {
				args.unshift('exec');
			}
			game.ws.send(JSON.stringify(get.stringifiedResult(args)));
		}
	}
	/**
	 * @param { string } id 
	 * @param {*} message 
	 */
	static sendTo(id, message) {
		return new lib.element.Client(new lib.element.NodeWS(id)).send(message);
	}
	static createServer() {
		lib.node.clients = [];
		lib.node.banned = [];
		lib.node.observing = [];
		lib.node.torespond = {};
		lib.node.torespondtimeout = {};
		lib.playerOL = {};
		lib.cardOL = {};
		lib.wsOL = {};
		ui.create.roomInfo();
		ui.create.chat();
		if (game.onlineroom) {
			void 0;
		}
		else {
			const WebSocketServer = require('ws').Server;
			const wss = new WebSocketServer({ port: 8080 });
			game.ip = get.ip();
			wss.on('connection', lib.init.connection);
		}
	}
	/**
	 * @returns { HTMLAudioElement }
	 */
	static playAudio() {
		let path = '', emptyPath = true, notCheckDBPath = true, onError = null;
		if (_status.video) {
			// 为了能更美观的写代码，默认返回audio而不额外加一个void类型
			// @ts-ignore
			if (arguments[1] != 'video') return;
			path = arguments[0];
		}
		else {
			for (const argument of arguments) {
				if (typeof argument === 'string' || typeof argument == 'number') {
					if (emptyPath) emptyPath = false;
					else if (notCheckDBPath) {
						notCheckDBPath = false;
						if (/^db:extension-[^:]*$/.test(path)) path += ':';
						else path += '/';
					}
					else path += '/';
					path += argument;
				}
				else if (typeof argument == 'function') onError = argument;
				if (_status.video) break;
			}
			if (path.startsWith('ext:')) path = path.replace(/^ext:/, 'extension/');
			else if (!path.startsWith('db:')) path = `audio/${path}`;
			if (!lib.config.repeat_audio && _status.skillaudio.includes(path)) return;
		}
		const audio = document.createElement('audio');
		audio.autoplay = true;
		audio.volume = lib.config.volumn_audio / 8;
		//Some browsers do not support "autoplay", so "oncanplay" listening has been added
		audio.oncanplay = () => Promise.resolve(audio.play()).catch(() => void 0);
		audio.onplay = () => {
			_status.skillaudio.add(path);
			setTimeout(() => _status.skillaudio.remove(path), 1000);
			game.addVideo("playAudio", null, path);
		};
		audio.onended = (event) => audio.remove();
		audio.onerror = (event) => {
			audio.remove();
			if (onError) onError(event);
		};
		new Promise((resolve, reject) => {
			if (path.startsWith('db:')) game.getDB('image', path.slice(3)).then(octetStream => resolve(get.objectURL(octetStream)), reject);
			else if (lib.path.extname(path)) resolve(`${lib.assetURL}${path}`);
			else resolve(`${lib.assetURL}${path}.mp3`);
		}).then(resolvedPath => {
			audio.src = resolvedPath;
			ui.window.appendChild(audio);
		});
		return audio;
	}
	/**
	* 根据skill中的audio,audioname,audioname2和player来获取音频地址列表
	* @typedef {[string,number]|string|number|boolean} audioInfo
	* @typedef {{audio: audioInfo, audioname?:string[], audioname2?:{[playerName: string]: audioInfo}}} skillInfo
	* @param { string } skill  技能名
	* @param { Player | string } [player]  角色/角色名
	* @param { skillInfo | audioInfo } [skillInfo]  预设的skillInfo/audioInfo(转为skillInfo)，覆盖lib.skill[skill]
	* @returns { string[] }  语音地址列表
	* @example
	* ```js
	* const info=lib.skill['skillname'];
	* info.audio=undefined //默认值[true,2]
	* info.audio=false // 不播放语音
	* info.audio=true // [skill/skillname.mp3]
	* info.audio=3 // [skill/skillname1.mp3,skill/skillname2.mp3,skill/skillname3.mp3]（项数为数字大小）
	* info.audio="(ext:extName|db:extension-extName)(/anyPath):true|number(:format)" //间接路径
	* // 同上，只是将目录改为(ext:extName|db:extension-extName)(/anyPath)，且可以指定格式(默认mp3)
	* info.audio="(ext:extName|db:extension-extName/)(anyPath/)filename(.format)" //直接路径
	* //path和format至少有一个，否则会识别为引用技能
	* //起始位置为audio/(若无anyPath则为audio/skill/)，若没有format默认mp3
	* info.audio="otherSkillname" //引用技能
	* //引用一个其他技能的语音，若lib.skill["otherSkillname"]不存在则读取"otherSkillname"的audio为默认值[true,2]
	* info.audio=["otherSkillname", number] //带fixedNum的引用技能
	* //同样引用一个其他技能的语音，若lib.skill["otherSkillname"]不存在则读取"otherSkillname"的audio为number
	* //若"otherSkillname"的语音数超过number，则只取前number个
	* info.audio=[true,2,"otherSkillname1",["otherSkillname2",2]] //任意元素拼接
	* //数组里可以放任何以上的格式，结果为分析完的结果合并
	* 
	* info.audioname=['player1','player2']
	* //audioname里可以放任意角色名。
	* //如果其中包含发动技能的角色名"player"，且info.audio不是直接路径"(anyPath/)filename(.format)"的形式
	* //则在"skill"和number中插入"_player"，形如
	* 
	* info.audioname2={'player1':audioInfo1,'player2':audioInfo2}
	* //audioname2是一个对象，其中key为角色名，value的类型和info.audio一样
	* //如果key中包含发动技能的角色名player，则直接改用info.audioname2[player]来播放语音
	* ```
	*/
	static parseSkillAudio(skill, player, skillInfo) {
		if (typeof player === 'string') player = { name: player };
		else if (typeof player !== 'object' || player === null) player = {};

		if (skillInfo && (typeof skillInfo !== 'object' || Array.isArray(skillInfo))) skillInfo = { audio: skillInfo };

		const checkSkill = (skill, history) => {
			if (!lib.skill[skill]) return false;
			if (!history.includes(skill)) return true;
			if (history[0] === skill) return false;
			//deadlock
			throw new RangeError(`parseSkillAudio: ${skill} in `, history, ` forms a deadlock`);
		}

		const getName = filter => {
			const name = (player.tempname || []).find(i => filter(i));
			return name || [player.name, player.name1, player.name2].reduce((result, name) => {
				if (result) return result;
				if (!name) return result;
				if (filter(name)) return name;
				let tempname = get.character(name, 4).find(tag => tag.startsWith('tempname:'));
				if (!tempname) return result;
				tempname = tempname.split(':').slice(1).find(i => filter(i));
				return tempname || result;
			}, void 0);
		}

		/**
		* @param {string} skill 
		* @param {{audioname:string[],history:string[]}} options
		* @param {skillInfo} [skillInfo]
		* @returns {string[]}
		*/
		function getAudioList(skill, options, skillInfo) {
			const info = skillInfo || lib.skill[skill];
			if (!info) {
				console.error(new ReferenceError(`parseSkillAudio: Cannot find ${skill} in lib.skill`));
				return parseAudio(skill, options, [true, 2]);
			}

			const { audioname, history } = options;
			history.unshift(skill);
			let audioInfo = info.audio;
			if (Array.isArray(info.audioname)) audioname.addArray(info.audioname);
			if (info.audioname2) audioInfo = info.audioname2[getName(i => info.audioname2[i])] || audioInfo;
			if (typeof audioInfo === 'function') audioInfo = audioInfo(player);

			return parseAudio(skill, options, audioInfo);
		}

		/**
		* @param {string} skill
		* @param {{audioname:string[],history:string[]}} options
		* @param {audioInfo} audioInfo  info.audio
		* @returns {string[]}
		*/
		function parseAudio(skill, options, audioInfo) {
			const audioname = options.audioname.slice();
			const history = options.history.slice();
			options = { audioname, history };
			if (Array.isArray(audioInfo)) {
				if (typeof audioInfo[0] === 'string' && typeof audioInfo[1] === 'number') {// [audioname, number]
					if (checkSkill(audioInfo[0], history)) return getAudioList(audioInfo[0], options).slice(0, audioInfo[1]);
					return parseAudio(audioInfo[0], options, audioInfo[1]);
				}
				return audioInfo.reduce((total, i) => total.addArray(parseAudio(skill, options, i)), []);
			}

			if (!['string', 'number', 'boolean'].includes(typeof audioInfo)) return parseAudio(skill, options, [true, 2]);
			if (audioInfo === false) return [];
			if (typeof audioInfo === 'string' && checkSkill(audioInfo, history)) return getAudioList(audioInfo, options);

			audioInfo = String(audioInfo);
			let list = audioInfo.match(/(?:(.*):|^)(true|\d+)(?::(.*)|$)/); // [path, number|true, format]
			if (!list) {
				let path = '', format = '';
				if (!/^db:|^ext:|\//.test(audioInfo)) path = 'skill/';
				if (!/\.\w+$/.test(audioInfo)) format = '.mp3';
				if (path && format) return parseAudio(audioInfo, options, [true, 2]);
				return [`${path}${audioInfo}${format}`];
			}

			let _audioname = getName(i => audioname.includes(i));
			_audioname = _audioname ? `_${_audioname}` : '';

			if (list[2] === 'true') return [`${list[1] || 'skill'}/${skill}${_audioname}.${list[3] || 'mp3'}`];

			const audioList = [];
			list[2] = parseInt(list[2]);
			for (let i = 1; i <= list[2]; i++) {
				audioList.push(`${list[1] || 'skill'}/${skill}${_audioname}${i}.${list[3] || 'mp3'}`);
			}
			return audioList;
		}

		return getAudioList(skill, { audioname: [], history: [] }, skillInfo);
	}
	/**
	 * 
	 * @param { string } skill 
	 * @param { Player | string } player 
	 * @param { boolean } [directaudio] 
	 * @param { boolean } [nobroadcast] 
	 * @param { ['lib']['skill'] } [skillInfo] 
	 * @returns 
	 */
	static trySkillAudio(skill, player, directaudio, nobroadcast, skillInfo) {
		if (!nobroadcast) game.broadcast(game.trySkillAudio, skill, player, directaudio, nobroadcast, skillInfo);
		const info = skillInfo || lib.skill[skill];
		if (!info) return;
		if (!lib.config.background_speak) return;
		if (info.direct && !directaudio) return;
		if (lib.skill.global.includes(skill) && !info.forceaudio) return;

		let audio, list = game.parseSkillAudio(skill, player, skillInfo).randomSort();
		return (function play() {
			if (!list.length) return;
			audio = list.shift();
			return game.playAudio(audio, play);
		})();
	}
	/**
	 * @param { string } name 
	 * @param { number } [index] 
	 * @returns 
	 */
	static playSkillAudio(name, index) {
		if (_status.video && arguments[1] != 'video') return;
		if (!lib.config.repeat_audio && _status.skillaudio.includes(name)) return;
		game.addVideo('playSkillAudio', null, name);
		if (name.indexOf('|') < name.lastIndexOf('|')) {
			name = name.slice(name.lastIndexOf('|') + 1);
		}
		_status.skillaudio.add(name);
		setTimeout(function () {
			_status.skillaudio.remove(name);
		}, 1000);
		var str = 'audio/skill/';
		var audio = document.createElement('audio');
		audio.autoplay = true;
		audio.volume = lib.config.volumn_audio / 8;
		audio.src = lib.assetURL + str + name + '.mp3';
		audio.addEventListener('ended', function () {
			this.remove();
		});
		if (typeof index != 'number') {
			index = Math.ceil(Math.random() * 2);
		}
		audio._changed = 1;
		audio.onerror = function () {
			switch (this._changed) {
				case 1: {
					audio.src = lib.assetURL + str + name + '.ogg';
					this._changed = 2;
					break;
				}
				case 2: {
					audio.src = lib.assetURL + str + name + index + '.mp3';
					this._changed = 3;
					break;
				}
				case 3: {
					audio.src = lib.assetURL + str + name + index + '.ogg';
					this._changed = 4;
					break;
				}
				default: {
					this.remove();
				}
			}
		};
		//Some browsers do not support "autoplay", so "oncanplay" listening has been added
		audio.oncanplay = function () {
			Promise.resolve(this.play()).catch(() => void 0);
		};
		ui.window.appendChild(audio);
	}
	/**
	 * @param { string | Card } card 
	 * @param { Player | Sex } sex 
	 */
	static playCardAudio(card, sex) {
		if (typeof card === 'string') {
			// @ts-ignore
			card = { name: card };
		}
		// @ts-ignore
		if (get.itemtype(sex) === 'player') {
			// @ts-ignore
			sex = (sex.sex == 'female' ? 'female' : 'male');
		} else if (typeof sex == 'string') {
			sex = (sex == 'female' ? 'female' : 'male');
		}
		if (!lib.config.background_audio || get.type(card) == 'equip' && !lib.config.equip_audio) return;
		let nature = get.natureList(card)[0];
		if (lib.natureAudio[card.name]) {
			let useAudio = lib.natureAudio[card.name][nature];
			if (useAudio === 'default') {
				game.playAudio('card', sex, `${card.name}_${nature}`);
				return;
			} else if (useAudio && useAudio[sex]) {
				game.playAudio(useAudio[sex]);
				return;
			}
		}
		const audio = lib.card[card.name].audio;
		if (typeof audio == 'string') {
			const audioInfo = audio.split(':');
			if (audio.startsWith('db:')) game.playAudio(`${audioInfo[0]}:${audioInfo[1]}`, audioInfo[2], `${card.name}_${sex}.${audioInfo[3] || 'mp3'}`);
			else if (audio.startsWith('ext:')) game.playAudio(`${audioInfo[0]}:${audioInfo[1]}`, `${card.name}_${sex}.${audioInfo[2] || 'mp3'}`);
			else game.playAudio('card', sex, `${audioInfo[0]}.${audioInfo[1] || 'mp3'}`);
		}
		else game.playAudio('card', sex, card.name);
	}
	static playBackgroundMusic() {
		if (lib.config.background_music == 'music_off') {
			ui.backgroundMusic.src = '';
			return;
		}
		if (_status._aozhan) {
			const aozhanBGMConfiguration = lib.config.mode_config.guozhan.aozhan_bgm;
			if (aozhanBGMConfiguration == 'disabled') return;
			let aozhan = _status.tempAozhan || aozhanBGMConfiguration;
			if (Array.isArray(aozhan)) aozhan = aozhan.randomGet('disabled', _status.currentAozhan) || aozhanBGMConfiguration;
			if (aozhan == 'random') aozhan = Object.keys(lib.mode.guozhan.config.aozhan_bgm.item).randomGet('disabled', 'random', _status.currentAozhan);
			_status.currentAozhan = aozhan;
			if (aozhan.startsWith('db:')) game.getDB('image', aozhan.slice(3)).then(result => ui.backgroundMusic.src = result);
			else if (aozhan.startsWith('ext:')) ui.backgroundMusic.src = `${lib.assetURL}extension/${aozhan.slice(4)}`;
			else ui.backgroundMusic.src = `${lib.assetURL}audio/background/aozhan_${aozhan}.mp3`;
			return;
		}
		let music = _status.tempMusic || lib.config.background_music;
		if (Array.isArray(music)) music = music.randomGet('music_off', _status.currentMusic) || lib.config.background_music;
		if (music == 'music_random') music = lib.config.all.background_music.randomGet('music_off', 'music_random', _status.currentMusic);
		_status.currentMusic = music;
		if (music == 'music_custom') {
			const backgroundMusicSourceConfiguration = lib.config.background_music_src;
			if (backgroundMusicSourceConfiguration) ui.backgroundMusic.src = backgroundMusicSourceConfiguration;
			return;
		}
		if (music.startsWith('db:')) game.getDB('image', music.slice(3)).then(result => ui.backgroundMusic.src = result);
		else if (music.startsWith('ext:')) ui.backgroundMusic.src = `${lib.assetURL}extension/${music.slice(4)}`;
		else ui.backgroundMusic.src = `${lib.assetURL}audio/background/${music}.mp3`;
	}
	// 某种意义上，改不了，得重写
	// 等正式用import导入再说
	/**
	 * @overload
	 * @param { 'character' } type 
	 * @param {(
	 * 	lib: Library,
	 * 	game: typeof Game,
	 * 	ui: UI,
	 * 	get: Get,
	 * 	ai: AI,
	 * _status: Status
	 * ) => importCharacterConfig } content 
	 * @param {*} [url] 
	 */
	/**
	 * @overload
	 * @param { 'card' } type 
	 * @param {(
	 * 	lib: Library,
	 * 	game: typeof Game,
	 * 	ui: UI,
	 * 	get: Get,
	 * 	ai: AI,
	 * _status: Status
	 * ) => importCardConfig } content 
	 * @param {*} [url] 
	 */
	/**
	 * @overload
	 * @param { 'mode' } type 
	 * @param {(
	 * 	lib: Library,
	 * 	game: typeof Game,
	 * 	ui: UI,
	 * 	get: Get,
	 * 	ai: AI,
	 * _status: Status
	 * ) => importModeConfig } content 
	 * @param {*} [url] 
	 */
	/**
	 * @overload
	 * @param { 'player' } type 
	 * @param {(
	 * 	lib: Library,
	 * 	game: typeof Game,
	 * 	ui: UI,
	 * 	get: Get,
	 * 	ai: AI,
	 * _status: Status
	 * ) => importPlayerConfig } content 
	 * @param {*} [url] 
	 */
	/**
	 * @overload
	 * @param { 'extension' } type 
	 * @param {(
	 * 	lib: Library,
	 * 	game: typeof Game,
	 * 	ui: UI,
	 * 	get: Get,
	 * 	ai: AI,
	 * _status: Status
	 * ) => importExtensionConfig } content 
	 * @param {*} [url] 
	 */
	static import(type, content, url) {
		if (type == 'extension') {
			const promise = game.loadExtension(content).then((name) => {
				if (typeof _status.extensionLoaded == "undefined")
					_status.extensionLoaded = [];
				_status.extensionLoaded.add(name);
				return name;
			});
			if (typeof _status.extensionLoading == "undefined") _status.extensionLoading = [];
			_status.extensionLoading.add(promise);
			return promise;
		}
		else {
			if (!lib.imported[type]) lib.imported[type] = {};
			const promise = Promise.resolve((gnc.is.generator(content) ? gnc.of(content) : content)(lib, game, ui, get, ai, _status)).then(content2 => {
				if (content2.name) {
					lib.imported[type][content2.name] = content2;
					delete content2.name;
				}
			});
			if (typeof _status.importing == "undefined") _status.importing = {};
			if (!_status.importing[type]) _status.importing[type] = [];
			_status.importing[type].add(promise);
			return promise;
		}
	}
	static async loadExtension(object) {
		let noEval = false;
		if (typeof object == 'function') {
			object = await (gnc.is.generatorFunc(object) ? gnc.of(object) : object)(lib, game, ui, get, ai, _status);
			noEval = true;
		}
		const name = object.name, extensionName = `extension_${name}`, extensionMenu = lib.extensionMenu[extensionName] = {
			enable: {
				name: '开启',
				init: true
			}
		}, objectPackage = object.package;
		if (objectPackage) {
			const author = Object.getOwnPropertyDescriptor(objectPackage, 'author');
			if (author) Object.defineProperty(extensionMenu.author = {
				get name() {
					return `作者：${this.author}`;
				},
				clear: true,
				nopointer: true,
			}, 'author', author);
			const intro = Object.getOwnPropertyDescriptor(objectPackage, 'intro');
			if (intro) Object.defineProperty(extensionMenu.intro = {
				clear: true,
				nopointer: true,
			}, 'name', intro);
		}
		const objectConfig = object.config;
		if (objectConfig) Object.defineProperties(extensionMenu, Object.keys(objectConfig).reduce((propertyDescriptorMap, key) => {
			propertyDescriptorMap[key] = Object.getOwnPropertyDescriptor(objectConfig, key);
			return propertyDescriptorMap;
		}, {}));
		const help = object.help;
		if (help) Object.defineProperties(lib.help, Object.keys(help).reduce((propertyDescriptorMap, key) => {
			propertyDescriptorMap[key] = Object.getOwnPropertyDescriptor(help, key);
			return propertyDescriptorMap;
		}, {}));
		if (object.editable !== false && lib.config.show_extensionmaker) extensionMenu.edit = {
			name: '编辑此扩展',
			clear: true,
			onclick: () => {
				if (game.editExtension && lib.extensionPack && lib.extensionPack[name]) game.editExtension(name);
				else alert('无法编辑未启用的扩展，请启用此扩展并重启后重试');
			}
		};
		extensionMenu.delete = {
			name: '删除此扩展',
			clear: true,
			onclick: function () {
				if (this.innerHTML != '<span>确认删除</span>') {
					this.innerHTML = '<span>确认删除</span>';
					new Promise(resolve => setTimeout(resolve, 1000)).then(() => this.innerHTML = '<span>删除此扩展</span>');
					return;
				}
				const page = this.parentNode, start = page.parentNode.previousSibling;
				page.remove();
				if (start) {
					const pageInStart = Array.from(start.childNodes).find(childNode => childNode.link == page);
					if (pageInStart) {
						let active = false;
						if (pageInStart.classList.contains('active')) active = true;
						pageInStart.remove();
						if (active) {
							start.firstChild.classList.add('active');
							start.nextSibling.appendChild(start.firstChild.link);
						}
					}
				}
				game.removeExtension(name);
				if (typeof object.onremove == 'function') object.onremove();
			}
		}

		if (_status.importingExtension) {
			game.importedPack = object;
			return;
		}
		const libConfig = lib.config;
		if (!object || !libConfig[`${extensionName}_enable`]) return;
		if (!noEval) lib.init.eval(object);
		const config = Object.keys(libConfig).reduce((constructingConfig, key) => {
			if (key != extensionName && key.startsWith(extensionName)) constructingConfig[key.slice(11 + name.length)] = libConfig[key];
			return constructingConfig;
		}, {});
		try {
			let extensionPack = lib.extensionPack[name];
			if (objectPackage) {
				extensionPack = lib.extensionPack[name] = objectPackage;
				objectPackage.files = object.files || {};
				const extensionPackFiles = objectPackage.files;
				if (!extensionPackFiles.character) extensionPackFiles.character = [];
				if (!extensionPackFiles.card) extensionPackFiles.card = [];
				if (!extensionPackFiles.skill) extensionPackFiles.skill = [];
			}
			else extensionPack = lib.extensionPack[name] = {};
			const content = object.content, precontent = object.precontent;
			extensionPack.code = {
				content: content,
				precontent: precontent,
				help: help,
				config: objectConfig
			}
			if (precontent) {
				_status.extension = name;
				await (gnc.is.generatorFunc(precontent) ? gnc.of(precontent) : precontent).call(object, config);
				delete _status.extension;
			}
			if (content) lib.extensions.push([name, content, config, _status.evaluatingExtension, objectPackage || {}]);
		}
		catch (e) {
			console.log(e);
		}

		return name;
	}
	/**
	 * @param { string } directory 
	 * @param { Function } [successCallback] 
	 * @param { Function } [errorCallback]
	 */
	static createDir(directory, successCallback, errorCallback) {
		const paths = directory.split('/').reverse();
		if (window.resolveLocalFileSystemURL) return new Promise((resolve, reject) => window.resolveLocalFileSystemURL(lib.assetURL, resolve, reject)).then(directoryEntry => {
			const redo = entry => new Promise((resolve, reject) => entry.getDirectory(paths.pop(), {
				create: true
			}, resolve, reject)).then(resolvedDirectoryEntry => {
				if (paths.length) return redo(resolvedDirectoryEntry);
				if (typeof successCallback == 'function') successCallback();
			});
			return redo(directoryEntry);
		}, reason => {
			if (typeof errorCallback != 'function') return Promise.reject(reason);
			errorCallback(reason);
		});
		const fs = require("fs");
		let path = __dirname;
		const redo = () => {
			path += `/${paths.pop()}`;
			return new Promise(resolve => fs.exists(path, resolve)).then(exists => {
				//不存在此目录
				if (!exists) return new Promise(resolve => fs.mkdir(path, resolve));
			}).then(() => {
				if (paths.length) return redo();
				if (typeof successCallback == 'function') successCallback();
			});
		};
		return redo();
	}
	static async importExtension(data, finishLoad, exportExtension, extensionPackage) {
		//by 来瓶可乐加冰、Rintim、Tipx-L
		if (!window.JSZip)
			await new Promise((resolve, reject) => lib.init.js(`${lib.assetURL}game`, "jszip", resolve, reject));

		const zip = new JSZip();
		if (get.objtype(data) == 'object') {
			//导出
			const _filelist = data._filelist, filelist2 = _filelist || [];
			if (_filelist) delete data._filelist;
			const filelist = Object.keys(data);
			filelist.forEach(value => zip.file(value, data[value]));
			game.print(filelist);
			game.print(filelist2);
			const generate = zip.generate({
				type: 'arraybuffer'
			});
			if (!exportExtension) {
				game.importExtension.apply(this, [generate, finishLoad]);
				return;
			}
			if (extensionPackage) {
				extensionPackage.files = filelist.concat(filelist2).filter(value => value != 'extension.js');
				const size = generate.byteLength;
				if (size < 1000) extensionPackage.size = `${size}B`;
				else if (size < 1000000) extensionPackage.size = `${Math.round(size / 1000)}KB`;
				else extensionPackage.size = `${Math.round(size / 100000) / 10}MB`;
				zip.file('package.js', Object.keys(extensionPackage).reduce((constructingData, key, currentIndex, keys) => `${constructingData}\t${key}:${JSON.stringify(extensionPackage[key])}${currentIndex < keys.length - 1 ? ',\n' : '\n};'}`, `extension["${exportExtension}"]={\n`));
			}
			const blob = zip.generate({
				type: 'blob'
			}), fileNameToSaveAs = `${exportExtension.replace(/\\|\/|:|\?|"|\*|<|>|\|/g, '-')}.zip`;

			if (lib.device) {
				const directory = lib.device == 'android' ? cordova.file.externalDataDirectory : cordova.file.documentsDirectory;
				new Promise((resolve, reject) => window.resolveLocalFileSystemURL(directory, resolve, reject)).then(directoryEntry => new Promise((resolve, reject) => directoryEntry.getFile(fileNameToSaveAs, {
					create: true
				}, resolve, reject))).then(fileEntry => new Promise((resolve, reject) => fileEntry.createWriter(resolve, reject))).then(fileWriter => new Promise((resolve, reject) => {
					fileWriter.onerror = reject;
					fileWriter.onwriteend = resolve;
					fileWriter.write(blob);
				})).then(() => alert(`文件已导出至${directory}${fileNameToSaveAs}`));
			}
			else {
				const downloadLink = document.createElement('a');
				downloadLink.download = fileNameToSaveAs;
				downloadLink.innerHTML = 'Download File';
				downloadLink.href = window.URL.createObjectURL(blob);
				downloadLink.click();
			}

			if (typeof finishLoad == 'function') finishLoad();
			return;
		}
		//导入
		const UHP = error => alert(`导入失败：\n${JSON.stringify(error, null, '\t')}`);
		try {
			zip.load(data);
			// alert(zip.file('文件夹/加扩展.js').asText())
			const str = zip.file('extension.js').asText();
			if (str === "" || undefined) throw ('你导入的不是扩展！请选择正确的文件');
			_status.importingExtension = true;
			eval(str);
			await Promise.allSettled(_status.extensionLoading);
			delete _status.extensionLoading;
			_status.importingExtension = false;
			if (!game.importedPack) throw ('err');
			const extensionName = game.importedPack.name;
			if (lib.config.all.plays.includes(extensionName)) throw ('禁止安装游戏原生扩展');
			const extensions = lib.config.extensions;
			if (extensions.includes(extensionName)) game.removeExtension(extensionName, true);
			extensions.add(extensionName);
			game.saveConfigValue('extensions');
			game.saveConfig(`extension_${extensionName}_enable`, true);
			const config = game.importedPack.config;
			Object.keys(config).forEach(value => {
				const configObject = config[value];
				if (configObject && 'init' in configObject) game.saveConfig(`extension_${extensionName}_${value}`, configObject.init);
			});
			if (game.download) {
				const files = zip.files, hiddenFileFlags = ['.', '_'], fileList = Object.keys(files).filter(key => !files[key].dir && !hiddenFileFlags.includes(key[0])).reverse();
				//alert(filelist)
				//电脑端
				//具备nodeJS环境
				if (lib.node && lib.node.fs) {
					const writeFile = errnoException => {
						if (errnoException) {
							finishLoad();
							UHP(errnoException);
							return;
						}
						if (fileList.length) {
							//filename 数组 ...dir+/+file
							//这里需要个创文件夹的函数
							const zipDir = fileList.pop(), fileName = zipDir.split('/'), name = fileName.pop(), letGo = name => new Promise(resolve => lib.node.fs.writeFile(`${__dirname}/extension/${extensionName}/${name}`, zip.file(zipDir).asNodeBuffer(), null, resolve)).then(writeFile);
							return (fileName.length ? game.createDir(`extension/${extensionName}/${fileName.join("/")}`).then(() => letGo(`${fileName.join('/')}/${name}`)) : letGo(name));
						}
						finishLoad();
					}
					game.ensureDirectory(`extension/${extensionName}`).then(writeFile).catch(UHP);
				}
				else new Promise((resolve, reject) => window.resolveLocalFileSystemURL(lib.assetURL, resolve, reject)).then(directoryEntry => new Promise((resolve, reject) => directoryEntry.getDirectory(`extension/${extensionName}`, {
					create: true
				}, resolve, reject))).then(directoryEntry => {
					//扩展文件夹
					const writeFile = () => {
						if (!fileList.length) {
							finishLoad();
							return;
						}
						//filename 数组 ...dir+/+file
						const zipDirectory = fileList.shift(), fileName = zipDirectory.split("/"), name = fileName.pop(), letGo = name => new Promise((resolve, reject) => directoryEntry.getFile(name, {
							create: true
						}, resolve, reject)).then(fileEntry => new Promise((resolve, reject) => fileEntry.createWriter(resolve, reject))).then(fileWriter => new Promise((resolve, reject) => {
							fileWriter.onerror = reject;
							fileWriter.onwriteend = resolve;
							fileWriter.write(zip.file(zipDirectory).asArrayBuffer());
						})).then(writeFile);
						return (fileName.length ? game.createDir(`extension/${extensionName}/${fileName.join('/')}`).then(() => letGo(`${fileName.join('/')}/${name}`)) : letGo(name));
					};
					return writeFile();
				}).catch(UHP);
			}
			else {
				localStorage.setItem(`${lib.configprefix}extension_${extensionName}`, str);
				const hiddenFileFlags = ['.', '_'], fileList = Object.keys(zip.files).filter(filePath => !hiddenFileFlags.includes(filePath[0]) && filePath[filePath.length - 1] != '/');
				if (fileList.length && lib.db) {
					lib.config.extensionInfo[extensionName] = {
						file: fileList
					};
					game.saveConfigValue('extensionInfo');
					fileList.forEach(filePath => {
						const arrayBuffer = zip.file(filePath).asArrayBuffer();
						if (!arrayBuffer) return;
						const blob = new Blob([arrayBuffer]);
						new Promise((resolve, reject) => {
							const fileReader = new FileReader();
							fileReader.onerror = reject;
							fileReader.onload = resolve;
							fileReader.readAsDataURL(blob, 'UTF-8');
						}).then(fileLoadedEvent => game.putDB('image', `extension-${extensionName}:${filePath}`, fileLoadedEvent.target.result));
					});
				}
				finishLoad();
			}
			delete game.importedPack;
		}
		catch (error) {
			UHP(error);
			return false;
		}
	}
	/**
	 * @param { string } textToWrite 
	 * @param { string } [name] 
	 */
	static export(textToWrite, name) {
		let textFileAsBlob = new Blob([textToWrite], { type: 'text/plain' });
		let fileNameToSaveAs = name || 'noname';
		fileNameToSaveAs = fileNameToSaveAs.replace(/\\|\/|:|\?|"|\*|<|>|\|/g, '.');

		if (lib.device) {
			let directory;
			if (lib.device == 'android') {
				directory = cordova.file.externalDataDirectory;
			}
			else {
				directory = cordova.file.documentsDirectory;
			}
			window.resolveLocalFileSystemURL(directory, function (entry) {
				entry.getFile(fileNameToSaveAs, { create: true }, function (fileEntry) {
					fileEntry.createWriter(function (fileWriter) {
						fileWriter.onwriteend = function () {
							alert('文件已导出至' + directory + fileNameToSaveAs);
						}
						fileWriter.write(textFileAsBlob)
					});
				});
			});
		}
		else {
			let downloadLink = document.createElement("a");
			downloadLink.download = fileNameToSaveAs;
			downloadLink.innerHTML = "Download File";
			downloadLink.href = window.URL.createObjectURL(textFileAsBlob);
			downloadLink.click();
		}
	}
	/**
	 * @param { string[] } list 
	 * @param { Function } [onsuccess] 
	 * @param { Function } [onerror] 
	 * @param { Function } [onfinish] 
	 * @param { Function } [process] 
	 * @param {*} [dev] 
	 */
	static multiDownload2(list, onsuccess, onerror, onfinish, process, dev) {
		list = list.slice(0);
		let download = function () {
			if (list.length) {
				let current = list.shift();
				let current2;
				if (typeof process == 'function') {
					current2 = process(current);
				}
				else {
					current2 = current;
				}
				if (current.startsWith('theme')) {
					game.print(current.slice(6));
				}
				else if (current.startsWith('image/skin')) {
					game.print(current.slice(11));
				}
				else {
					game.print(current.slice(current.lastIndexOf('/') + 1));
				}
				game.download(current, current2, function () {
					if (onsuccess) onsuccess(list.length);
					download();
				}, function () {
					if (onerror) onerror(list.length);
					download();
				}, dev);
			}
			else {
				if (onfinish) onfinish();
			}
		}
		download();
	}
	/**
	 * @param { string[] } list 
	 * @param { Function } onsuccess 
	 * @param { Function } onerror 
	 * @param { Function } onfinish
	 * @param { Function } [process] 
	 * @param {*} [dev] 
	 */
	static multiDownload(list, onsuccess, onerror, onfinish, process, dev) {
		if (lib.config.dev) game.print(get.url());
		const args = Array.from(arguments);
		if (list.length <= 3) {
			game.multiDownload2.apply(this, args);
		}
		else {
			let num = Math.round(list.length / 3);
			let left = 3;
			args[3] = function () {
				left--;
				if (left == 0) {
					onfinish();
				}
			};
			setTimeout(function () {
				args[0] = list.slice(0, num); game.multiDownload2.apply(game, args);
			});
			setTimeout(function () {
				args[0] = list.slice(num, 2 * num); game.multiDownload2.apply(this, args);
			}, 200);
			setTimeout(function () {
				args[0] = list.slice(2 * num); game.multiDownload2.apply(this, args);
			}, 400);
		}
	}
	/**
	 * @param { string } url 
	 * @param { Function } onload 
	 * @param { Function } [onerror] 
	 * @param { Function } [onprogress] 
	 */
	static fetch(url, onload, onerror, onprogress) {
		var tmpName = '~tmp' + get.id();
		game.download(encodeURI(url), tmpName, function () {
			game.readFile(tmpName, function (data) {
				onload(data);
				game.removeFile(tmpName);
			}, onerror);
		}, onerror, null, onprogress);
	}
	/**
	 * @param { string } time 
	 * @param { string } mode 
	 */
	static playVideo(time, mode) {
		if (!_status.replayvideo) {
			localStorage.setItem(lib.configprefix + 'playbackmode', lib.config.mode);
		}
		game.saveConfig('mode', mode);
		localStorage.setItem(lib.configprefix + 'playback', time);
		game.reload();
	}
	/**
	 * @param { Videos } video 
	 */
	static playVideoContent(video) {
		const next = game.createEvent('video', false);
		next.video = video;
		ui.system.style.display = 'none';
		ui.system.hide();
		ui.arena.style.display = 'none';
		ui.arena.hide();
		ui.window.classList.remove('leftbar');
		ui.window.classList.remove('rightbar');
		ui.historybar.style.display = 'none';
		_status.event = next;
		_status.paused = false;
		_status.paused2 = false;
		_status.over = false;
		_status.video = true;
		clearTimeout(_status.timeout);
		for (let i in lib.characterPack) {
			for (let j in lib.characterPack[i]) {
				lib.character[j] = lib.character[j] || lib.characterPack[i][j];
			}
		}
		next.setContent('playVideoContent');
		game.loop();
	}
	static videoContent = {
		arrangeLib: function (content) {
			for (var i in content) {
				for (var j in content[i]) {
					lib[i][j] = content[i][j];
				}
			}
		},
		$syncDisable: function (player, map) {
			player.disabledSlots = map;
			player.$syncDisable(map)
		},
		$syncExpand: function (player, map) {
			player.expandedSlots = map;
			player.$syncExpand(map)
		},
		$disableJudge: function (player, map) {
			player.$disableJudge()
		},
		$enableJudge: function (player, map) {
			player.$enableJudge()
		},
		jiuNode: function (player, bool) {
			//Powered by 升麻
			if (bool) {
				if (!player.node.jiu && lib.config.jiu_effect) {
					player.node.jiu = ui.create.div('.playerjiu', player.node.avatar);
					player.node.jiu2 = ui.create.div('.playerjiu', player.node.avatar2);
				}
			}
			else {
				if (player.node.jiu) {
					player.node.jiu.delete();
					player.node.jiu2.delete();
					delete player.node.jiu;
					delete player.node.jiu2;
				}
			}
		},
		init: function (players) {
			if (game.chess) return;
			if (lib.config.mode == 'versus') {
				players.bool = players.pop();
			}
			ui.arena.setNumber(players.length);
			ui.arena.classList.add('video');
			game.players.length = 0;
			game.dead.length = 0;
			ui.create.players(players.length);
			game.me = game.players[0];
			ui.handcards1 = game.me.node.handcards1;
			ui.handcards2 = game.me.node.handcards2;
			ui.handcards1Container.appendChild(ui.handcards1);
			ui.handcards2Container.appendChild(ui.handcards2);
			if (lib.config.mode == 'versus') {
				if (players.bool) {
					ui.arena.setNumber(parseInt(ui.arena.dataset.number) + 1);
					for (var i = 0; i < game.players.length; i++) {
						game.players[i].dataset.position = parseInt(game.players[i].dataset.position) + 1;
					}
					game.singleHandcard = true;
					ui.arena.classList.add('single-handcard');
					ui.window.classList.add('single-handcard');
					ui.fakeme = ui.create.div('.fakeme.avatar', ui.me);
				}
				ui.arena.style.display = '';
				ui.refresh(ui.arena);
				ui.arena.show();
			}
			else if (lib.config.mode == 'boss') {
				if (!players.boss) {
					game.singleHandcard = true;
					ui.arena.classList.add('single-handcard');
					ui.window.classList.add('single-handcard');
					ui.fakeme = ui.create.div('.fakeme.avatar', ui.me);
				}
				ui.arena.setNumber(8);
			}
			ui.updatehl();
			for (var i = 0; i < players.length; i++) {
				if (lib.config.mode == 'identity') {
					if (_status.mode == 'stratagem') {
						game.players[i].init(players[i].name, players[i].name2);
						game.players[i].identity = players[i].identity;
						if (game.players[i].identity == 'fan' && game.players[i].isCamouflaged && game.me.identity == 'nei' || game.players[i] == game.me) {
							game.players[i].setIdentity(players[i].identity);
						}
					}
					else {
						game.players[i].init(players[i].name, players[i].name2);
						game.players[i].setIdentity(players[i].identity);
					}
				}
				else if (lib.config.mode == 'doudizhu' || lib.config.mode == 'single') {
					game.players[i].init(players[i].name, players[i].name2);
					game.players[i].setIdentity(players[i].identity);
				}
				else if (lib.config.mode == 'stone') {
					game.players[i].init(players[i].name, players[i].name2);
					game.players[i].classList.add('noidentity');
					game.players[i].updateActCount(null, players[i].count, 0);
				}
				else if (lib.config.mode == 'boss') {
					game.players[i].init(players[i].name, players[i].name2);
					game.players[i].setIdentity(players[i].identity);
					game.players[i].dataset.position = players[i].position;
					game.players[i].node.action.innerHTML = '行动';
				}
				else if (lib.config.mode == 'versus') {
					game.players[i].init(players[i].name, players[i].name2);
					game.players[i].node.identity.firstChild.innerHTML = players[i].identity;
					game.players[i].node.identity.dataset.color = players[i].color;
					game.players[i].node.action.innerHTML = '行动';
				}
				else if (lib.config.mode == 'guozhan') {
					game.players[i].name = players[i].name;
					game.players[i].name1 = players[i].name1;
					game.players[i].name2 = players[i].name2;

					game.players[i].sex = 'unknown';
					game.players[i].identity = 'unknown';

					lib.translate[game.players[i].name] = players[i].translate;
					game.players[i].init(players[i].name1, players[i].name2);

					game.players[i].classList.add('unseen_v');
					game.players[i].classList.add('unseen2_v');
					if (game.players[i] != game.me) {
						game.players[i].node.identity.firstChild.innerHTML = '猜';
						game.players[i].node.identity.dataset.color = 'unknown';
					}
					else {
						game.players[i].setIdentity(game.players[i].group);
					}
				}
			}
			for (var i = 0; i < game.players.length; i++) {
				game.playerMap[game.players[i].dataset.position] = game.players[i];
			}

			if (lib.config.mode == 'versus') {
				if (players.bool) {
					game.onSwapControl();
				}
			}
			else if (lib.config.mode == 'boss') {
				if (!players.boss) {
					game.onSwapControl();
				}
				ui.arena.style.display = '';
				ui.refresh(ui.arena);
				ui.arena.show();
				ui.updatehl();
			}
		},
		newcard: function (content) {
			if (content) {
				lib.translate[content.name] = content.translate;
				lib.translate[content.name + '_info'] = content.info;
				lib.card[content.name] = {};
				lib.card[content.name].cardimage = content.card
				for (var i in lib.card[content.card]) {
					lib.card[content.name][i] = lib.card[content.card][i];
				}
				if (content.legend) {
					lib.card[content.name].legend = true;
				}
				else if (content.epic) {
					lib.card[content.name].epic = true;
				}
				else if (content.unique) {
					lib.card[content.name].unique = true;
				}
			}
		},
		changeLand: function (player, url) {
			game.changeLand(url, player);
		},
		destroyLand: function () {
			if (ui.land) {
				ui.land.destroy();
			}
		},
		playAudio: function (str) {
			game.playAudio(str, 'video');
		},
		playSkillAudio: function (name) {
			game.playSkillAudio(name, 'video');
		},
		phaseChange: function (player) {
			if (player) {
				var glowing = document.querySelector('.glow_phase');
				if (glowing) {
					glowing.classList.remove('glow_phase');
				}
				if (lib.config.glow_phase) {
					player.classList.add('glow_phase');
					// player.dataset.glow_phase=lib.config.glow_phase;
				}
			}
			else {
				console.log(player);
			}
		},
		playerfocus: function (player, time) {
			if (player && player.playerfocus) {
				player.playerfocus(time);
			}
			else {
				console.log(player);
			}
		},
		playerfocus2: function () {
			ui.arena.classList.add('playerfocus');
			setTimeout(function () {
				ui.arena.classList.remove('playerfocus');
			}, 1500)
		},
		identityText: function (player, str) {
			if (player && str) {
				player.node.identity.firstChild.innerHTML = str;
			}
			else {
				console.log(player);
			}
		},
		identityColor: function (player, str) {
			if (player && str) {
				player.node.identity.dataset.color = str;
			}
			else {
				console.log(player);
			}
		},
		chessSwap: function (content) {
			var me = game.playerMap[content[0]];
			var player = game.playerMap[content[1]];
			if (me) {
				me.classList.remove('current_action');
			}
			if (player) {
				player.classList.add('current_action');
			}
		},
		chessgainmod: function (player, num) {
			if (Array.isArray(num)) {
				num = get.infoCards(num);
			}
			if (player && player.$gainmod) {
				player.$gainmod(num);
			}
			else {
				console.log(player);
			}
		},
		moveTo: function (player, pos) {
			if (player && player.moveTo && pos) {
				player.moveTo(pos[0], pos[1]);
			}
			else {
				console.log(player)
			}
		},
		addObstacle: function (pos) {
			if (pos) {
				game.addObstacle(pos[0], pos[1]);
			}
		},
		removeObstacle: function (pos) {
			game.removeObstacle(pos);
		},
		moveObstacle: function (pos) {
			if (pos) {
				game.moveObstacle(pos[0], pos[1], pos[2]);
			}
		},
		colorObstacle: function (pos) {
			if (pos) {
				game.colorObstacle(pos[0], pos[1]);
			}
		},
		thrownhighlight1: function () {
			ui.arena.classList.add('thrownhighlight');
		},
		thrownhighlight2: function () {
			ui.arena.classList.remove('thrownhighlight');
		},
		chessFocus: function (player) {
			if (player) {
				player.chessFocus();
			}
			else {
				console.log('chessFocus');
			}
		},
		removeTreasure: function (pos) {
			if (game.playerMap[pos]) {
				game.playerMap[pos].delete();
				delete game.playerMap[pos];
			}
			else {
				console.log(pos);
			}
		},
		initobs: function (obs) {
			if (obs) {
				for (var i = 0; i < obs.length; i++) {
					game.addObstacle(obs[i]);
				}
			}
			else {
				console.log(obs);
			}
		},
		stonePosition: function (content) {
			var player = game.playerMap[content[0]];
			if (player) {
				delete game.playerMap[content[0]];
				player.dataset.position = content[1];
				game.playerMap[content[1]] = player;
			}
			else {
				console.log(content);
			}
		},
		bossSwap: function (player, name) {
			if (player && name) {
				player.delete();
				var noboss = false;
				if (name[0] == '_') {
					name = name.slice(1);
					noboss = true;
				}
				var boss = ui.create.player().init(name);
				boss.dataset.position = player.dataset.position;
				game.playerMap[player.dataset.position] = boss;
				if (game.me == player) {
					game.me = boss;
				}
				game.players.push(boss);
				game.arrangePlayers();
				if (!noboss) {
					game.boss = boss;
					boss.setIdentity('zhu');
					boss.identity = 'zhu';
				}
				else {
					boss.setIdentity('zhong');
					boss.identity = 'zhong';
				}
				ui.arena.appendChild(boss.addTempClass('zoominanim'));
			}
		},
		stoneSwap: function (info) {
			var player = ui.create.player();
			player.classList.add('noidentity');
			player.dataset.position = info.position;
			player.addTempClass(info.me ? 'replaceme' : 'replaceenemy');
			player.actcount = info.actcount;
			player.init(info.name, info.name2);
			game.players.push(player);
			player.updateActCount(null, info.actcount, 0);
			ui.arena.appendChild(player);
			game.playerMap[player.dataset.position] = player;
			game.arrangePlayers();
		},
		chess_tongshuai: function (player, content) {
			if (player && player.storage) {
				player.storage.tongshuai.owned = content;
			}
			else {
				console.log(player);
			}
		},
		chess_tongshuai_skill: function (player, content) {
			if (player && content) {
				if (player.marks.tongshuai.firstChild) {
					player.marks.tongshuai.firstChild.remove();
				}
				player.marks.tongshuai.setBackground(content[0], 'character');
				player.additionalSkills.tongshuai = content[1];
			}
			else {
				console.log(player);
			}
		},
		smoothAvatar: function (player, vice) {
			if (player && player.node) {
				if (vice) {
					if (player.node.avatar2) {
						player.smoothAvatar(vice);
					}
				}
				else {
					if (player.node.avatar) {
						player.smoothAvatar(vice);
					}
				}
			}
		},
		setAvatar: function (player, content) {
			if (player && content && content.length == 2) {
				player.setAvatar(content[0], content[1])
			}
		},
		setAvatarQueue: function (player, content) {
			if (player && content && content.length == 2) {
				player.setAvatarQueue(content[0], content[1])
			}
		},
		addSubPlayer: function (player, content) {
			if (player && content && content[0] && content[1] &&
				content[2] && content[3] && content[4]) {
				var skill = content[0];
				lib.skill[skill] = content[1];
				lib.character[skill] = content[2];
				lib.translate[skill] = content[3];
				player.storage[skill] = content[4];
			}
		},
		arenaNumber: function (content) {
			ui.arena.dataset.number = content;
		},
		reinit: function (source, content) {
			if (source && content) {
				source.uninit();
				source.init(content[0]);
				source.node.identity.dataset.color = content[1];
			}
			else {
				console.log(source);
			}
		},
		reinit2: function (source, name) {
			if (source && name) {
				source.init(name);
			}
			else {
				console.log(source);
			}
		},
		reinit3: function (source, content) {
			if (source && content) {
				var info1 = lib.character[content.from];
				var info2 = lib.character[content.to];
				if (content.avatar2) {
					source.name2 = content.to;
					if (source.isUnseen(0)) {
						source.sex = info2[0];
					}
					source.node.avatar2.setBackground(content.to, 'character');
					source.node.name2.innerHTML = get.slimName(content.to);
				}
				else {
					source.name = content.to;
					source.sex = info2[0];
					source.node.avatar.setBackground(content.to, 'character');
					source.node.name.innerHTML = get.slimName(content.to);
				}
				source.maxHp = content.hp;
				this.update();
				for (var i = 0; i < info1[3].length; i++) {
					source.removeSkill(info1[3][i]);
				}
				for (var i = 0; i < info2[3].length; i++) {
					source.addSkill(info2[3][i]);
				}
			}
		},
		skill: function (player, content) {
			if (typeof content == 'string') {
				if (lib.skill[content]) lib.skill[content].video(player);
			}
			else if (Array.isArray(content)) {
				if (lib.skill[content[0]]) lib.skill[content[0]].video(player, content[1]);
			}
			else {
				console.log(player, content)
			}
		},
		addFellow: function (content) {
			var player = game.addFellow(content[0], content[1], content[2]);
			game.playerMap[player.dataset.position] = player;
		},
		windowzoom1: function () {
			ui.window.style.transition = 'all 0.5s';
			ui.window.classList.add('zoomout3');
			ui.window.hide();
		},
		windowzoom2: function () {
			ui.window.style.transition = 'all 0s';
			ui.refresh(ui.window);
		},
		windowzoom3: function () {
			ui.window.classList.remove('zoomout3');
			ui.window.classList.add('zoomin3');
		},
		windowzoom4: function () {
			ui.window.style.transition = 'all 0.5s';
			ui.refresh(ui.window);
			ui.window.show();
			ui.window.classList.remove('zoomin3');
		},
		windowzoom5: function () {
			ui.window.style.transition = '';
		},
		updateActCount: function (player, content) {
			if (player && content) {
				player.updateActCount(content[0], content[1], content[2]);
			}
			else {
				console.log(player);
			}
		},
		showIdentity: function (player, identity) {
			identity = identity || (player ? player.identity : null);
			if (player && player.identity) {
				player.showIdentity(identity);
			}
			else {
				console.log(player);
			}
		},
		setIdentity: function (player, identity) {
			if (player && identity) {
				player.setIdentity(identity);
			}
			else {
				console.log(num);
			}
		},
		showCharacter: function (player, num) {
			if (player && player.classList) {
				switch (num) {
					case 0:
						player.classList.remove('unseen_v');
						break;
					case 1:
						player.classList.remove('unseen2_v');
						break;
					case 2:
						player.classList.remove('unseen_v');
						player.classList.remove('unseen2_v');
						break;
				}
				if (!player.classList.contains('unseen_v') && (!player.name2 || !player.classList.contains('unseen2_v')) && player.storage.nohp) {
					delete player.storage.nohp;
					player.node.hp.show();
					player.update();
				}
			}
			else {
				console.log(num);
			}
		},
		hidePlayer: function (player) {
			if (player) {
				player.hide();
			}
		},
		deleteHandcards: function (player) {
			if (player) {
				player.node.handcards1.delete();
				player.node.handcards2.delete();
			}
		},
		hideCharacter: function (player, num) {
			if (player && player.classList) {
				switch (num) {
					case 0:
						player.classList.add('unseen_v');
						break;
					case 1:
						player.classList.add('unseen2_v');
						break;
					case 2:
						player.classList.add('unseen_v');
						player.classList.add('unseen2_v');
						break;
				}
			}
			else {
				console.log(num);
			}
		},
		popup: function (player, info) {
			if (player && info) {
				player.popup(info[0], info[1]);
			}
			else {
				console.log(player);
			}
		},
		log: function (str) {
			game.log(str);
		},
		draw: function (player, info) {
			if (player && player.$draw) {
				player.$draw(info);
			}
			else {
				console.log(player);
			}
		},
		drawCard: function (player, info) {
			if (player && info) {
				player.$draw(get.infoCards(info));
			}
			else {
				console.log(player);
			}
		},
		throw: function (player, info) {
			if (player && info) {
				player.$throw(get.infoCards(info[0]), info[1], null, info[2]);
			}
			else {
				console.log(player);
			}
		},
		compare: function (player, info) {
			if (player && info) {
				player.$compare(get.infoCard(info[0]), game.playerMap[info[1]], get.infoCard(info[2]));
			}
			else {
				console.log(player);
			}
		},
		compareMultiple: function (player, info) {
			if (player && info) {
				player.$compareMultiple(get.infoCard(info[0]), get.infoTargets(info[1]), get.infoCards(info[2]));
			}
			else {
				console.log(player);
			}
		},
		give: function (player, info) {
			if (player && info) {
				player.$give(info[0], game.playerMap[info[1]]);
			}
			else {
				console.log(player);
			}
		},
		giveCard: function (player, info) {
			if (player && info) {
				player.$give(get.infoCards(info[0]), game.playerMap[info[1]]);
			}
			else {
				console.log(player);
			}
		},
		gain: function (player, info) {
			if (player && player.$gain) {
				player.$gain(info);
			}
			else {
				console.log(player);
			}
		},
		gainCard: function (player, info) {
			if (player && info) {
				player.$gain(get.infoCards(info));
			}
			else {
				console.log(player);
			}
		},
		gain2: function (player, cards) {
			if (player && player.$draw) {
				var nodeList = document.querySelectorAll('#arena>.card,#chess>.card');
				var nodes = [];
				for (var i = 0; i < nodeList.length; i++) {
					nodes.push(nodeList[i]);
				}
				for (var i = 0; i < cards.length; i++) {
					for (var j = 0; j < nodes.length; j++) {
						if (cards[i][2] == nodes[j].name && cards[i][0] == nodes[j].suit && cards[i][1] == nodes[j].number) {
							nodes[j].moveDelete(player);
							cards.splice(i--, 1);
							nodes.splice(j--, 1);
							break;
						}
					}
				}
				if (cards.length) {
					player.$draw(get.infoCards(cards));
				}
			}
			else {
				console.log(player);
			}
		},
		deletenode: function (player, cards, method) {
			if (cards) {
				var nodeList = document.querySelectorAll('#arena>.card,#chess>.card');
				var nodes = [];
				for (var i = 0; i < nodeList.length; i++) {
					nodes.push(nodeList[i]);
				}
				for (var i = 0; i < cards.length; i++) {
					for (var j = 0; j < nodes.length; j++) {
						if (cards[i][2] == nodes[j].name && cards[i][0] == nodes[j].suit && cards[i][1] == nodes[j].number) {
							nodes[j].delete();
							if (method == 'zoom') {
								nodes[j].style.transform = 'scale(0)';
							}
							cards.splice(i--, 1);
							nodes.splice(j--, 1);
							break;
						}
					}
				}
			}
			else {
				console.log(player, cards);
			}
		},
		highlightnode: function (player, card) {
			if (card) {
				var nodeList = document.querySelectorAll('#arena>.card,#chess>.card');
				var nodes = [];
				for (var i = 0; i < nodeList.length; i++) {
					nodes.push(nodeList[i]);
				}
				for (var j = nodes.length - 1; j >= 0; j--) {
					if (card[2] == nodes[j].name && card[0] == nodes[j].suit && card[1] == nodes[j].number) {
						nodes[j].classList.add('thrownhighlight');
						break;
					}
				}
			}
			else {
				console.log(player, cards);
			}
		},
		uiClear: function () {
			ui.clear();
		},
		judge1: function (player, content) {
			if (player && content) {
				var judging = get.infoCard(content[0]);
				if (game.chess) {
					judging.copy('thrown', 'center', 'thrownhighlight', ui.arena).addTempClass('start');
				}
				else {
					player.$throwordered(judging.copy('thrownhighlight'), true);
				}

				ui.create.dialog(content[1]).videoId = content[2];
				ui.arena.classList.add('thrownhighlight');
			}
			else {
				console.log(player);
			}
		},
		centernode: function (content) {
			get.infoCard(content).copy('thrown', 'center', 'thrownhighlight', ui.arena).addTempClass('start');
		},
		judge2: function (videoId) {
			for (var i = 0; i < ui.dialogs.length; i++) {
				if (ui.dialogs[i].videoId == videoId) {
					ui.dialogs[i].close();
				}
			}
			ui.arena.classList.remove('thrownhighlight');
		},
		unmarkname: function (player, name) {
			if (player && player.unmark) {
				player.unmark(name);
			}
			else {
				console.log(player);
			}
		},
		unmark: function (player, name) {
			if (player && player.marks && player.marks[name]) {
				player.marks[name].delete();
				player.marks[name].style.transform += ' scale(0.2)';
				delete player.marks[name];
				ui.updatem(this);
			}
		},
		flame: function (player, type) {
			if (player && type) {
				player['$' + type]();
			}
			else {
				console.log(player);
			}
		},
		throwEmotion: function (player, content) {
			if (player && content) {
				player.$throwEmotion(game.playerMap[content[0]], content[1]);
			}
			else {
				console.log(player);
			}
		},
		addGaintag: function (player, content) {
			if (player && content) {
				var checkMatch = function (l1, l2) {
					for (var i = 0; i < l1.length; i++) {
						for (var j = 0; j < l2.length; j++) {
							if (l2[j].suit == l1[i][0] && l2[j].number == l1[i][1] && l2[j].name == l1[i][2]) {
								l2[j].addGaintag(content[1]);
								l2.splice(j--, 1);
								break;
							}
						}
					}
				}
				checkMatch(content[0], player.getCards('h'));
			}
			else {
				console.log(player);
			}
		},
		removeGaintag: function (player, content) {
			if (player && content) {
				if (Array.isArray(content)) player.removeGaintag.apply(player, content)
				else player.removeGaintag(content);
			}
			else {
				console.log(player);
			}
		},
		line: function (player, content) {
			if (player && content) {
				player.line(game.playerMap[content[0]], content[1]);
			}
			else {
				console.log(player);
			}
		},
		fullscreenpop: function (player, content) {
			if (player && content) {
				player.$fullscreenpop(content[0], content[1], content[2]);
			}
			else {
				console.log(player);
			}
		},
		damagepop: function (player, content) {
			if (player && content) {
				player.$damagepop(content[0], content[1], content[2]);
			}
			else {
				console.log(player);
			}
		},
		damage: function (player, source) {
			if (player && player.$damage) {
				player.$damage(game.playerMap[source]);
			}
			else {
				console.log(player);
			}
		},
		diex: function (player) {
			if (!player) {
				console.log('diex');
				return;
			}
			var cards = player.getCards('hej');
			for (var i = 0; i < cards.length; i++) {
				cards[i].discard();
			}
			while (player.node.marks.childNodes.length > 1) {
				player.node.marks.lastChild.remove();
			}
			player.classList.add('dead');
			player.classList.remove('turnedover');
			player.classList.remove('out');
			player.node.count.innerHTML = '0';
			player.node.hp.hide();
			player.node.equips.hide();
			player.node.count.hide();
			player.previous.next = player.next;
			player.next.previous = player.previous;
			game.players.remove(player);
			game.dead.push(player);
			if (lib.config.mode == 'stone') {
				setTimeout(function () {
					player.delete();
				}, 500);
			}
		},
		tafangMe: function (player) {
			if (player) {
				game.me = player;
				ui.me.lastChild.show();
				ui.create.fakeme();
				ui.handcards1 = player.node.handcards1.addTempClass('start').fix();
				ui.handcards2 = player.node.handcards2.addTempClass('start').fix();
				ui.handcards1Container.appendChild(ui.handcards1);
				ui.handcards2Container.appendChild(ui.handcards2);
				ui.updatehl();
				game.setChessInfo();
			}
		},
		deleteChessPlayer: function (player) {
			if (player) {
				player.delete();
				delete game.playerMap[player.dataset.position];
				game.players.remove(player);
				for (var i = 0; i < ui.phasequeue.length; i++) {
					if (ui.phasequeue[i].link == player) {
						ui.phasequeue[i].remove();
						ui.phasequeue.splice(i, 1);
						break;
					}
				}
			}
		},
		addChessPlayer: function (content) {
			game.addChessPlayer.apply(this, content);
		},
		die: function (player) {
			if (!player) {
				console.log('die');
				return;
			}
			player.$die();
			if (game.chess) {
				delete lib.posmap[player.dataset.position];
				setTimeout(function () {
					player.delete();
				}, 500);
				for (var i = 0; i < ui.phasequeue.length; i++) {
					if (ui.phasequeue[i].link == player) {
						ui.phasequeue[i].remove();
						ui.phasequeue.splice(i, 1);
						break;
					}
				}
			}
		},
		revive: function (player) {
			if (!player) {
				console.log('revive');
				return;
			}
			player.classList.remove('dead');
			player.node.hp.show();
			player.node.equips.show();
			player.node.count.show();
			player.node.avatar.style.transform = '';
			player.node.avatar2.style.transform = '';
			player.removeAttribute('style');
		},
		update: function (player, info) {
			if (player && info) {
				player.hp = info[1];
				player.maxHp = info[2];
				player.hujia = info[3];
				player.update(info[0]);
			}
			else {
				console.log(player);
			}
		},
		phaseJudge: function (player, card) {
			if (player && card) {
				// player.$phaseJudge(get.infoCard(card));
			}
			else {
				console.log(player);
			}
		},
		directgain: function (player, cards) {
			if (player && cards) {
				player.directgain(get.infoCards(cards));
			}
			else {
				console.log(player);
			}
		},
		directgains: function (player, cards) {
			if (player && cards) {
				player.directgains(get.infoCards(cards));
			}
			else {
				console.log(player);
			}
		},
		directequip: function (player, cards) {
			if (player && cards) {
				player.directequip(get.infoCards(cards));
			}
			else {
				console.log(player);
			}
		},
		gain12: function (player, cards12) {
			if (player && cards12) {
				var cards1 = get.infoCards(cards12[0]);
				var cards2 = get.infoCards(cards12[1]);
				for (var i = 0; i < cards1.length; i++) {
					cards1[i].classList.add('drawinghidden');
					cards1[i].addGaintag(cards12[2]);
					player.node.handcards1.insertBefore(cards1[i], player.node.handcards1.firstChild);
				}
				for (var i = 0; i < cards2.length; i++) {
					cards2[i].classList.add('drawinghidden');
					cards2[i].addGaintag(cards12[2]);
					player.node.handcards2.insertBefore(cards2[i], player.node.handcards2.firstChild);
				}
				ui.updatehl();
			}
			else {
				console.log(player);
			}
		},
		equip: function (player, card) {
			if (player && card) {
				player.$equip(get.infoCard(card));
			}
			else {
				console.log(player);
			}
		},
		addJudge: function (player, content) {
			if (player && content) {
				var card = get.infoCard(content[0]);
				card.viewAs = content[1];
				if (card.viewAs && card.viewAs != card.name && (card.classList.contains('fullskin') || card.classList.contains('fullborder'))) {
					card.classList.add('fakejudge');
					card.node.background.innerHTML = lib.translate[card.viewAs + '_bg'] || get.translation(card.viewAs)[0]
				}
				card.classList.add('drawinghidden');
				player.node.judges.insertBefore(card, player.node.judges.firstChild);
				ui.updatej(player);
			}
			else {
				console.log(player);
			}
		},
		markCharacter: function (player, content) {
			if (player && content) {
				if (game.playerMap[content.target]) {
					content.target = game.playerMap[content.target];
				}
				var mark = player.markCharacter(content.target, content);
				if (content.id) {
					player.marks[content.id] = mark;
				}
			}
			else {
				console.log(player);
			}
		},
		changeMarkCharacter: function (player, content) {
			if (player && content && player.marks[content.id]) {
				player.marks[content.id].info = {
					name: content.name,
					content: content.content
				};
				player.marks[content.id].setBackground(content.target, 'character');
			}
		},
		mark: function (player, content) {
			if (player && content) {
				var mark = player.mark(content.id, content);
			}
			else {
				console.log(player);
			}
		},
		markSkill: function (player, content) {
			if (player && content) {
				if (content[1]) {
					player.markSkill(content[0], null, get.infoCard(content[1]));
				}
				else {
					player.markSkill(content[0]);
				}
			}
			else {
				console.log(player);
			}
		},
		unmarkSkill: function (player, name) {
			if (player && player.unmarkSkill) {
				player.unmarkSkill(name);
			}
			else {
				console.log(player);
			}
		},
		storage: function (player, content) {
			if (player && content) {
				if (content[2]) {
					switch (content[2]) {
						case 'cards': content[1] = get.infoCards(content[1]); break;
						case 'card': content[1] = get.infoCard(content[1]); break;
					}
				}
				player.storage[content[0]] = content[1];
			}
			else {
				console.log(player);
			}
		},
		markId: function (player, content) {
			if (player && content) {
				player.mark(get.infoCard(content[0]), content[1]);
			}
			else {
				console.log(player);
			}
		},
		unmarkId: function (player, content) {
			if (player && content) {
				player.unmark(get.infoCard(content[0]), content[1]);
			}
			else {
				console.log(player);
			}
		},
		lose: function (player, info) {
			if (player && info) {
				var hs = info[0] || [], es = info[1] || [], js = info[2] || [], ss = info[3] || [];
				var phs = player.getCards('h'), pes = player.getCards('e'), pjs = player.getCards('j'), pss = player.getCards('s');
				var checkMatch = function (l1, l2) {
					for (var i = 0; i < l1.length; i++) {
						for (var j = 0; j < l2.length; j++) {
							if (l2[j].suit == l1[i][0] && l2[j].number == l1[i][1] && l2[j].name == l1[i][2]) {
								l2[j].remove();
								l2.splice(j--, 1);
								break;
							}
						}
					}
				}
				checkMatch(hs, phs);
				checkMatch(es, pes);
				checkMatch(js, pjs);
				checkMatch(ss, pss);
				ui.updatehl();
			}
			else {
				console.log(player);
			}
		},
		loseAfter: function (player) {
			if (!player) {
				console.log('loseAfter');
				return;
			}
		},
		link: function (player, bool) {
			if (player && player.classList) {
				if (bool) {
					player.addLink();
				}
				else {
					player.removeLink();
				}
			}
			else {
				console.log(player);
			}
		},
		turnOver: function (player, bool) {
			if (player && player.classList) {
				if (bool) {
					player.classList.add('turnedover');
				}
				else {
					player.classList.remove('turnedover');
				}
			}
			else {
				console.log(player);
			}
		},
		showCards: function (player, info) {
			if (info) {
				var dialog = ui.create.dialog(info[0], get.infoCards(info[1]));
				setTimeout(function () {
					dialog.close();
				}, 1000);
			}
			else {
				console.log(player);
			}
		},
		cardDialog: function (content) {
			if (Array.isArray(content)) {
				ui.create.dialog(content[0], get.infoCards(content[1])).videoId = content[2];
			}
			else if (typeof content == 'number') {
				for (var i = 0; i < ui.dialogs.length; i++) {
					if (ui.dialogs[i].videoId == content) {
						ui.dialogs[i].close();
						return;
					}
				}
			}
		},
		changeSeat: function (player, info) {
			if (player && player.getBoundingClientRect && player.changeSeat) {
				player.changeSeat(info);
				game.playerMap = {};
				var players = game.players.concat(game.dead);
				for (var i = 0; i < players.length; i++) {
					game.playerMap[players[i].dataset.position] = players[i];
				}
			}
		},
		dialogCapt: function (content) {
			for (var i = 0; i < ui.dialogs.length; i++) {
				if (ui.dialogs[i].videoId == content[0]) {
					ui.dialogs[i].content.firstChild.innerHTML = content[1];
					return;
				}
			}
		},
		swapSeat: function (content) {
			var player1 = game.playerMap[content[0]];
			var player2 = game.playerMap[content[1]];
			if (!player1 || !player2) {
				console.log(content);
				return;
			}
			var temp1, pos, i, num;
			temp1 = player1.dataset.position;
			player1.dataset.position = player2.dataset.position;
			player2.dataset.position = temp1;
			game.arrangePlayers();
			if (player1.dataset.position == '0' || player2.dataset.position == '0') {
				pos = parseInt(player1.dataset.position);
				if (pos == 0) pos = parseInt(player2.dataset.position);
				num = game.players.length + game.dead.length;
				for (i = 0; i < game.players.length; i++) {
					temp1 = parseInt(game.players[i].dataset.position) - pos;
					if (temp1 < 0) temp1 += num;
					game.players[i].dataset.position = temp1;
				}
				for (i = 0; i < game.dead.length; i++) {
					temp1 = parseInt(game.dead[i].dataset.position) - pos;
					if (temp1 < 0) temp1 += num;
					game.dead[i].dataset.position = temp1;
				}
			}
			game.playerMap = {};
			var players = game.players.concat(game.dead);
			for (var i = 0; i < players.length; i++) {
				game.playerMap[players[i].dataset.position] = players[i];
			}
		},
		removeTafangPlayer: function () {
			ui.fakeme.hide();
			ui.handcards1Container.innerHTML = '';
			ui.handcards2Container.innerHTML = '';
			game.me = ui.create.player();
		},
		swapControl: function (player, hs) {
			if (player && player.node) {
				var cards = get.infoCards(hs);
				player.node.handcards1.innerHTML = '';
				player.node.handcards2.innerHTML = '';
				player.directgain(cards, false);

				game.me.node.handcards1.remove();
				game.me.node.handcards2.remove();

				ui.handcards1 = player.node.handcards1.addTempClass('start').fix();
				ui.handcards2 = player.node.handcards2.addTempClass('start').fix();
				ui.handcards1Container.insertBefore(ui.handcards1, ui.handcards1Container.firstChild);
				ui.handcards2Container.insertBefore(ui.handcards2, ui.handcards2Container.firstChild);

				game.me = player;
				ui.updatehl();
				if (game.chess) {
					ui.create.fakeme();
				}
			}
			else {
				console.log(player);
			}
		},
		onSwapControl: function () {
			game.onSwapControl();
		},
		swapPlayer: function (player, hs) {
			if (player && player.node) {
				var cards = get.infoCards(hs);
				player.node.handcards1.innerHTML = '';
				player.node.handcards2.innerHTML = '';
				player.directgain(cards, false);

				var pos = parseInt(player.dataset.position);
				var num = game.players.length + game.dead.length;
				var players = game.players.concat(game.dead);
				var temp;
				for (var i = 0; i < players.length; i++) {
					temp = parseInt(players[i].dataset.position) - pos;
					if (temp < 0) temp += num;
					players[i].dataset.position = temp;
				}
				game.me.node.handcards1.remove();
				game.me.node.handcards2.remove();
				game.me = player;
				ui.handcards1 = player.node.handcards1.addTempClass('start').fix();
				ui.handcards2 = player.node.handcards2.addTempClass('start').fix();
				ui.handcards1Container.appendChild(ui.handcards1);
				ui.handcards2Container.appendChild(ui.handcards2);

				ui.updatehl();

				game.playerMap = {};
				var players = game.players.concat(game.dead);
				for (var i = 0; i < players.length; i++) {
					game.playerMap[players[i].dataset.position] = players[i];
				}
			}
			else {
				console.log(player);
			}
		},
		over: function (str) {
			var dialog = ui.create.dialog('hidden');
			dialog.noforcebutton = true;
			dialog.content.innerHTML = str;
			dialog.forcebutton = true;
			dialog.open();
			if (game.chess) {
				dialog.classList.add('center');
			}
			if ((game.layout == 'long2' || game.layout == 'nova') && !game.chess) {
				ui.arena.classList.add('choose-character');
				if (ui.me) ui.me.hide();
				if (ui.mebg) ui.mebg.hide()
				if (ui.autonode) ui.autonode.hide();
				if (lib.config.radius_size != 'off') {
					if (ui.historybar) ui.historybar.style.borderRadius = '0 0 0 4px';
				}
			}
		}
	}
	static reload() {
		if (_status) {
			if (_status.reloading) return;
			_status.reloading = true;
		}
		if (_status.video && !_status.replayvideo) {
			localStorage.removeItem(lib.configprefix + 'playbackmode');
		}
		localStorage.setItem('show_splash_off', true);
		if (lib.status.reload) {
			_status.waitingToReload = true;
		}
		else {
			window.location.reload();
		}
	}
	static reload2() {
		lib.status.reload--;
		if (lib.status.reload == 0 && lib.ondb2.length) {
			const command = lib.ondb2.shift();
			game[command[0]](...command[1]);
		}
		if (lib.status.reload == 0 && lib.ondb.length) {
			const command = lib.ondb.shift();
			game[command[0]](...command[1]);
		}
		if (lib.status.reload || !_status.waitingToReload) return;
		window.location.reload();
		delete _status.waitingToReload;
	}
	static exit() {
		var ua = userAgent;
		var ios = ua.includes('iphone') || ua.includes('ipad') || ua.includes('macintosh');
		//electron
		if (typeof window.process == 'object' && typeof window.require == 'function') {
			var versions = window.process.versions;
			var electronVersion = parseFloat(versions.electron);
			var remote;
			if (electronVersion >= 14) {
				remote = require('@electron/remote');
			} else {
				remote = require('electron').remote;
			}
			var thisWindow = remote.getCurrentWindow();
			thisWindow.destroy();
			window.process.exit();
		}
		// android-cordova环境
		else if (lib.device === 'android') {
			if (navigator.app && navigator.app.exitApp) {
				navigator.app.exitApp();
			}
		}
		//ios-cordova环境或ios浏览器环境
		else if (lib.device === 'ios' || !lib.device && ios) {
			game.saveConfig('mode');
			if (_status) {
				if (_status.reloading) return;
				_status.reloading = true;
			}
			if (_status.video && !_status.replayvideo) {
				localStorage.removeItem(lib.configprefix + 'playbackmode');
			}
			window.location.reload();
		}
		//非ios的网页版
		else if (!ios) {
			window.onbeforeunload = null;
			window.close();
		}
	}
	/**
	 * @param { string } url 
	 */
	static open(url) {
		if (lib.device) {
			if (cordova.InAppBrowser) {
				cordova.InAppBrowser.open(url, '_system');
			}
			else {
				ui.create.iframe(url);
			}
		}
		else {
			window.open(url);
		}
	}
	static reloadCurrent() {
		game.saveConfig('continue_name', [game.me.name1 || game.me.name, game.me.name2]);
		game.saveConfig('mode', lib.config.mode);
		localStorage.setItem(lib.configprefix + 'directstart', true);
		game.reload();
	}
	/**
	 * @param { Function } func 
	 */
	static update(func) {
		lib.updates.push(func);
		if (lib.updates.length === 1) {
			game.run();
		}
		return func;
	}
	/**
	 * @param { Function } func 
	 */
	static unupdate(func) {
		lib.updates.remove(func);
	}
	static stop() {
		cancelAnimationFrame(lib.status.frameId);
	}
	static run() {
		if (lib.updates.length) {
			cancelAnimationFrame(lib.status.frameId);
			lib.status.frameId = requestAnimationFrame(function (time) {
				if (lib.status.time !== 0) {
					lib.status.delayed += time - lib.status.time;
				}
				lib.status.frameId = requestAnimationFrame(lib.run);
			});
		}
	}
	/**
	 * @param { string } type 
	 * @param { Player } player 
	 * @param { any } content 
	 * @returns 
	 */
	static addVideo(type, player, content) {
		if (_status.video || game.online) return;
		if (!_status.videoInited) {
			if (type == 'arrangeLib') {
				lib.video.push({
					type: type,
					player: player,
					content: content,
					delay: 0
				});
			}
			return;
		}
		if (type == 'storage' && player && player.updateMarks) {
			player.updateMarks();
		}
		if (game.getVideoName) {
			var time = get.time();
			if (!_status.lastVideoLog) {
				_status.lastVideoLog = time;
			}
			if (get.itemtype(player) == 'player') {
				player = player.dataset.position;
			}
			lib.video.push({
				type: type,
				player: player,
				content: content,
				delay: time - _status.lastVideoLog
			});
			_status.lastVideoLog = time;
		}
	}
	/**
	 * @param { Function } func 
	 */
	static draw(func) {
		lib.canvasUpdates.push(func);
		if (!lib.status.canvas) {
			lib.status.canvas = true;
			game.update(lib.updateCanvas);
		}
	}
	/**
	 * @param { number } [time] 
	 */
	static vibrate(time) {
		if ('vibrate' in navigator) {
			navigator.vibrate(time || 500);
		}
	}
	static prompt() {
		let str, forced, callback, noinput = false, str2 = '';
		for (let i = 0; i < arguments.length; i++) {
			if (arguments[i] == 'alert') {
				forced = true;
				noinput = true;
			}
			else if (typeof arguments[i] == 'string') {
				if (arguments[i].startsWith('###')) {
					var list = arguments[i].slice(3).split('###');
					str = list[0];
					str2 = list[1];
				}
				else str = arguments[i];
			}
			else if (typeof arguments[i] == 'boolean') {
				forced = arguments[i];
			}
			else if (typeof arguments[i] == 'function') {
				callback = arguments[i];
			}
		}
		if (!callback) {
			callback = function () { };
		}
		//try{
		//	if(noinput){
		//		throw('e');
		//	}
		//	var result=prompt(str);
		//	callback(result);
		//}
		//catch(e){
		let promptContainer = ui.create.div('.popup-container', ui.window, function () {
			if (this.clicked) {
				this.clicked = false;
			}
			else {
				clickCancel();
			}
		});
		let dialogContainer = ui.create.div('.prompt-container', promptContainer);
		let dialog = ui.create.div('.menubg', ui.create.div(dialogContainer), function () {
			promptContainer.clicked = true;
		});
		let strnode = ui.create.div('', str || '', dialog);
		let input = ui.create.node('input', ui.create.div(dialog));
		input.value = str2;
		if (noinput) {
			input.style.display = 'none';
		}
		let controls = ui.create.div(dialog);
		let clickConfirm = function () {
			if (noinput) {
				//给一个返回值使promise化正常使用
				callback(true);
				promptContainer.remove();
			}
			else {
				callback(input.value);
				promptContainer.remove();
			}
		}
		let clickCancel = function () {
			callback(false);
			if (!forced) {
				promptContainer.remove();
			}
		}
		let confirmNode = ui.create.div('.menubutton.large.disabled', '确定', controls, clickConfirm);
		if (!forced) {
			ui.create.div('.menubutton.large', '取消', controls, clickCancel);
		}
		if (noinput || (str2 && str2.length > 0)) {
			confirmNode.classList.remove('disabled');
		}
		else {
			input.onkeydown = function (e) {
				if (e.keyCode == 13) {
					clickConfirm();
				}
				else if (e.keyCode == 27) {
					clickCancel();
				}
				e.stopPropagation();
			}
			input.onkeyup = function (e) {
				if (input.value) {
					confirmNode.classList.remove('disabled');
				}
				else {
					confirmNode.classList.remove('disabled');
				}
				e.stopPropagation();
			}
			input.focus();
		}
		//}
	}
	static alert(str) {
		game.prompt(str, 'alert');
	}
	static print() {
		if (!_status.toprint) {
			_status.toprint = [];
		}
		_status.toprint.push(Array.from(arguments));
	}
	static animate = {
		window: function (num) {
			switch (num) {
				case 1: {
					ui.window.style.transition = 'all 0.5s';
					ui.window.classList.add('zoomout3');
					ui.window.hide();
					game.addVideo('windowzoom1');
					game.delay(0, 500);
					break;
				}
				case 2: {
					ui.window.style.transition = 'all 0s';
					ui.refresh(ui.window);
					game.addVideo('windowzoom2');
					game.pause();
					setTimeout(function () {
						ui.window.classList.remove('zoomout3');
						ui.window.classList.add('zoomin3');
						game.addVideo('windowzoom3');
						setTimeout(function () {
							ui.window.style.transition = 'all 0.5s';
							ui.refresh(ui.window);
							ui.window.show();
							ui.window.classList.remove('zoomin3');
							game.addVideo('windowzoom4');
							setTimeout(function () {
								ui.window.style.transition = '';
								game.addVideo('windowzoom5');
								game.resume();
							}, 500);
						}, 100);
					}, 100);
					break;
				}
			}
		},
		flame: function (x, y, duration, type) {
			var particles = [];
			var particle_count = 50;
			if (type == 'thunder' || type == 'recover') {
				particle_count = 30;
			}
			else if (type == 'coin' || type == 'dust') {
				particle_count = 50;
			}
			else if (type == 'legend') {
				particle_count = 120;
			}
			else if (type == 'epic') {
				particle_count = 80;
			}
			else if (type == 'rare') {
				particle_count = 50;
			}
			for (var i = 0; i < particle_count; i++) {
				particles.push(new particle());
			}
			function particle() {
				this.speed = { x: -1 + Math.random() * 2, y: -5 + Math.random() * 5 };
				if (type == 'thunder' || type == 'coin' || type == 'dust') {
					this.speed.y = -3 + Math.random() * 5;
					this.speed.x = -2 + Math.random() * 4;
				}
				if (type == 'legend' || type == 'rare' || type == 'epic') {
					this.speed.x *= 3;
					this.speed.y *= 1.5;
				}
				this.location = { x: x, y: y };

				this.radius = 0.5 + Math.random() * 1;

				this.life = 10 + Math.random() * 10;
				this.death = this.life;

				switch (type) {
					case 'thunder': {
						this.b = 255;
						this.r = Math.round(Math.random() * 255);
						this.g = Math.round(Math.random() * 255);
						this.x += Math.random() * 20 - 10;
						this.y += Math.random() * 20 - 10;

						break;
					}
					case 'fire': {
						this.r = 255;
						this.g = Math.round(Math.random() * 155);
						this.b = 0;
						break;
					}
					case 'coin': {
						this.r = 255;
						this.g = Math.round(Math.random() * 25 + 230);
						this.b = Math.round(Math.random() * 100 + 50);
						this.location.x += Math.round(Math.random() * 60) - 30;
						this.location.y += Math.round(Math.random() * 40) - 20;
						if (this.location.x < x) {
							this.speed.x = -Math.abs(this.speed.x);
						}
						else if (this.location.x > x) {
							this.speed.x = Math.abs(this.speed.x);
						}
						this.life *= 1.3;
						this.death *= 1.3;
						break;
					}
					case 'dust': {
						this.r = Math.round(Math.random() * 55) + 105;
						this.g = Math.round(Math.random() * 55) + 150;
						this.b = 255;
						this.location.x += Math.round(Math.random() * 60) - 30;
						this.location.y += Math.round(Math.random() * 40) - 20;
						if (this.location.x < x) {
							this.speed.x = -Math.abs(this.speed.x);
						}
						else if (this.location.x > x) {
							this.speed.x = Math.abs(this.speed.x);
						}
						this.life *= 1.3;
						this.death *= 1.3;
						break;
					}
					case 'legend': {
						this.r = 255;
						this.g = Math.round(Math.random() * 100 + 155);
						this.b = Math.round(Math.random() * 100 + 50);
						this.location.x += Math.round(Math.random() * 60) - 30;
						this.location.y += Math.round(Math.random() * 40) - 20;
						if (this.location.x < x) {
							this.speed.x = -Math.abs(this.speed.x);
						}
						else if (this.location.x > x) {
							this.speed.x = Math.abs(this.speed.x);
						}
						this.speed.x /= 2;
						this.speed.y /= 2;
						this.life *= 2;
						this.death *= 2;
						break;
					}
					case 'epic': {
						this.r = Math.round(Math.random() * 55) + 200;
						this.g = Math.round(Math.random() * 100) + 55;
						this.b = 255;
						this.location.x += Math.round(Math.random() * 60) - 30;
						this.location.y += Math.round(Math.random() * 40) - 20;
						if (this.location.x < x) {
							this.speed.x = -Math.abs(this.speed.x);
						}
						else if (this.location.x > x) {
							this.speed.x = Math.abs(this.speed.x);
						}
						this.speed.x /= 2;
						this.speed.y /= 2;
						this.life *= 2;
						this.death *= 2;
						break;
					}
					case 'rare': {
						this.r = Math.round(Math.random() * 55) + 105;
						this.g = Math.round(Math.random() * 55) + 150;
						this.b = 255;
						this.location.x += Math.round(Math.random() * 60) - 30;
						this.location.y += Math.round(Math.random() * 40) - 20;
						if (this.location.x < x) {
							this.speed.x = -Math.abs(this.speed.x);
						}
						else if (this.location.x > x) {
							this.speed.x = Math.abs(this.speed.x);
						}
						this.speed.x /= 2;
						this.speed.y /= 2;
						this.life *= 2;
						this.death *= 2;
						break;
					}
					case 'recover': {
						this.g = 255;
						this.r = Math.round(Math.random() * 200 + 55);
						this.b = Math.round(Math.random() * 155 + 55);
						this.location.x += Math.round(Math.random() * 60) - 30;
						this.location.y += Math.round(Math.random() * 40) - 20;
						if (this.location.x < x) {
							this.speed.x = -Math.abs(this.speed.x);
						}
						else if (this.location.x > x) {
							this.speed.x = Math.abs(this.speed.x);
						}
						this.speed.x /= 2;
						this.speed.y /= 2;
						this.life *= 2;
						this.death *= 2;
						break;
					}
					default: {
						this.r = 255;
						this.g = Math.round(Math.random() * 155);
						this.b = 0;
					}
				}
			}

			game.draw(function (time, surface) {
				surface.globalCompositeOperation = "source-over";
				surface.globalCompositeOperation = "lighter";

				for (var i = 0; i < particles.length; i++) {
					var p = particles[i];

					surface.beginPath();
					var middle = 0.5;
					var radius = p.radius;
					if (type == 'recover' || type == 'legend' || type == 'rare' ||
						type == 'epic' || type == 'coin' || type == 'dust') {
						middle = 0.7;
						radius /= 3;
					}

					p.opacity = Math.round(p.death / p.life * 100) / 100
					var gradient = surface.createRadialGradient(p.location.x, p.location.y, 0, p.location.x, p.location.y, p.radius);
					gradient.addColorStop(0, "rgba(" + p.r + ", " + p.g + ", " + p.b + ", " + p.opacity + ")");
					gradient.addColorStop(middle, "rgba(" + p.r + ", " + p.g + ", " + p.b + ", " + p.opacity + ")");
					gradient.addColorStop(1, "rgba(" + p.r + ", " + p.g + ", " + p.b + ", 0)");
					surface.fillStyle = gradient;
					surface.arc(p.location.x, p.location.y, radius, Math.PI * 2, false);
					surface.fill();
					p.death--;
					if (type == 'recover') {
						p.radius += 0.5;
					}
					else if (type == 'coin' || type == 'dust') {
						p.radius += 0.7;
					}
					else if (type == 'legend' || type == 'rare' || type == 'epic') {
						p.radius += 0.5;
					}
					else {
						p.radius++;
					}
					p.location.x += (p.speed.x);
					p.location.y += (p.speed.y);

					if (p.death < 0 || p.radius < 0) {
						if (typeof duration == 'number' && time + 500 >= duration) {
							particles.splice(i--, 1);
						}
						else {
							particles[i] = new particle();
						}
					}
				}
				if (particles.length == 0) {
					return false;
				}
			});
		}
	}
	/**
	 * @param { [number, number | {opacity:any, color:any, dashed:any, duration:any} | string, number, number] } path 
	 */
	static linexy(path) {
		const from = [path[0], path[1]], to = [path[2], path[3]];
		let total = typeof arguments[1] === 'number' ? arguments[1] : lib.config.duration * 2,
			opacity = 1,
			color = [255, 255, 255],
			dashed = false,
			drag = false;
		if (arguments[1] && typeof arguments[1] == 'object') Object.keys(arguments[1]).forEach(value => {
			switch (value) {
				case 'opacity':
					opacity = arguments[1][value];
					break;
				case 'color':
					color = arguments[1][value];
					break;
				case 'dashed':
					dashed = arguments[1][value];
					break;
				case 'duration': total = arguments[1][value];
					break;
			}
		});
		else if (typeof arguments[1] == 'string') color = arguments[1];
		if (typeof color == 'string') color = lib.lineColor.get(color) || [255, 255, 255];
		let node;
		if (arguments[1] == 'drag') {
			color = [236, 201, 71];
			drag = true;
			if (arguments[2]) node = arguments[2];
			else {
				node = ui.create.div('.linexy.drag');
				node.style.left = `${from[0]}px`;
				node.style.top = `${from[1]}px`;
				node.style.background = `linear-gradient(transparent,rgba(${color.toString()},${opacity}),rgba(${color.toString()},${opacity}))`;
				if (game.chess) ui.chess.appendChild(node);
				else ui.arena.appendChild(node);
			}
		}
		else {
			node = ui.create.div('.linexy.hidden');
			node.style.left = `${from[0]}px`;
			node.style.top = `${from[1]}px`;
			node.style.background = `linear-gradient(transparent,rgba(${color.toString()},${opacity}),rgba(${color.toString()},${opacity}))`;
			node.style.transitionDuration = `${total / 3000}s`;
		}
		const dy = to[1] - from[1], dx = to[0] - from[0];
		let deg = Math.atan(Math.abs(dy) / Math.abs(dx)) / Math.PI * 180;
		if (dx >= 0) if (dy <= 0) deg += 90;
		else deg = 90 - deg;
		else if (dy <= 0) deg = 270 - deg;
		else deg += 270;
		if (drag) {
			node.style.transform = `rotate(${(-deg)}deg)`;
			node.style.height = `${get.xyDistance(from, to)}px`;
		}
		else {
			node.style.transform = `rotate(${(-deg)}deg) scaleY(0)`;
			node.style.height = `${get.xyDistance(from, to)}px`;
			if (['div', 'fragment'].includes(get.objtype(arguments[1]))) arguments[1].appendChild(node);
			else if (game.chess) ui.chess.appendChild(node);
			else ui.arena.appendChild(node);
			ui.refresh(node);
			node.show();
			node.style.transform = `rotate(${(-deg)}deg) scaleY(1)`;
			node.listenTransition(() => setTimeout(() => {
				if (!node.classList.contains('removing')) node.delete();
			}, total / 3));
		}
		return node;
	}
	/**
	 * @param { [number, number | {opacity:any, color:any, dashed:any, duration:any} | string, number, number] } path 
	 */
	static _linexy(path) {
		let from = [path[0], path[1]];
		let to = [path[2], path[3]];
		let total = typeof arguments[1] === 'number' ? arguments[1] : lib.config.duration * 2;
		let opacity = 1;
		let color = [255, 255, 255];
		let dashed = false;
		if (typeof arguments[1] == 'object') {
			for (let i in arguments[1]) {
				switch (i) {
					case 'opacity': opacity = arguments[1][i]; break;
					case 'color': color = arguments[1][i]; break;
					case 'dashed': dashed = arguments[1][i]; break;
					case 'duration': total = arguments[1][i]; break;
				}
			}
		}
		else if (arguments[1] == 'fire' || arguments[1] == 'thunder' || arguments[1] == 'green') {
			color = arguments[1];
		}
		if (color == 'fire') {
			color = [255, 146, 68];
		}
		else if (color == 'thunder') {
			color = [141, 216, 255];
		}
		else if (color == 'green') {
			color = [141, 255, 216];
		}
		let drawfunc = function (time, ctx) {
			let current;
			if (time < total / 3) {
				ctx.strokeStyle = 'rgba(' + color.toString() + ',' + opacity * (time / (total / 3)) + ')';
				current = [from[0] + (to[0] - from[0]) * time / (total / 3),
				from[1] + (to[1] - from[1]) * time / (total / 3)];
			}
			else if (time <= total) {
				current = to;
				if (time > total / 1.5) {
					ctx.strokeStyle = 'rgba(' + color.toString() + ',' + opacity * (1 - (time - total / 1.5) / (total - total / 1.5)) + ')';
				}
				else {
					ctx.strokeStyle = 'rgba(' + color.toString() + ',' + opacity + ')';
				}
			}
			else {
				return false;
			}
			ctx.beginPath();
			if (dashed) {
				ctx.lineCap = 'butt';
				ctx.setLineDash([8, 2]);
			}
			else {
				ctx.lineCap = 'round';
			}
			ctx.moveTo(from[0], from[1]);
			ctx.lineTo(current[0], current[1]);
			ctx.stroke();
		};
		if (arguments[2] && game.chess) {
			game.draw2(drawfunc);
		}
		else {
			game.draw(drawfunc);
		}
	}
	/**
	 * @param { string } name 
	 * @param { string } skill 
	 * @param { Player } player 
	 * @param { GameEventPromise } event 
	 * @returns { GameEventPromise }
	 */
	static createTrigger(name, skill, player, event) {
		let info = get.info(skill);
		if (!info) return false;
		if ((player.isOut() || player.removed) && !info.forceOut) return;
		if (player.isDead() && !info.forceDie) return;
		let next = game.createEvent('trigger', false);
		next.skill = skill;
		next.player = player;
		next.triggername = name;
		next.forceDie = true;
		next.includeOut = true;
		next._trigger = event;
		next.setContent('createTrigger');
		return next;
	}
	/**
	 * @legacy Use {@link lib.element.GameEvent.constructor} instead.
	 * 
	 * @param { string } name 
	 * @param { false } [trigger]
	 * @param { GameEventPromise } [triggerEvent] 
	 */
	static createEvent(name, trigger, triggerEvent) {
		const next = (new lib.element.GameEvent(name, trigger)).toPromise();
		(triggerEvent || _status.event).next.push(next);
		return next;
	}
	/**
	 * @param { string } name 
	 * @param { { extension: string, sex: Sex, group: string, hp: string | number, skills?: string[], tags?: any[], translate: string } } information 
	 */
	static addCharacter(name, information) {
		const extensionName = _status.extension || information.extension, character = [
			information.sex,
			information.group,
			information.hp,
			information.skills || [],
			[
				_status.evaluatingExtension ? `db:extension-${extensionName}:${name}.jpg` : `ext:${extensionName}/${name}.jpg`,
				`die:ext:${extensionName}/${name}.mp3`
			]
		];
		if (information.tags) character[4] = character[4].concat(information.tags);
		lib.character[name] = character;
		const packName = `mode_extension_${extensionName}`;
		if (!lib.characterPack[packName]) lib.characterPack[packName] = {};
		lib.translate[name] = information.translate;
		lib.characterPack[packName][name] = character;
		lib.translate[`${packName}_character_config`] = extensionName;
	}
	/**
	 * @param { { mode?: string, forbid?: any, character: { [key: string]: Character }, skill: { [key: string]: object }, [key: string]: any } } pack 
	 * @param { string } [packagename] 
	 */
	static addCharacterPack(pack, packagename) {
		let extname = _status.extension || '扩展';
		let gzFlag = false;
		packagename = packagename || extname;
		for (let i in pack) {
			if (i == 'mode') {
				if (pack[i] == "guozhan") gzFlag = true;
				continue;
			}
			if (i == 'forbid') continue;
			for (let j in pack[i]) {
				if (i == 'character') {
					if (!pack[i][j][4]) {
						pack[i][j][4] = [];
					}
					let imgsrc;
					if (_status.evaluatingExtension) {
						imgsrc = 'db:extension-' + extname + ':' + j + '.jpg';
					}
					else {
						imgsrc = 'ext:' + extname + '/' + j + '.jpg';
					}
					const audiosrc = 'die:ext:' + extname + '/' + j + '.mp3';
					if (!pack[i][j][4].some(str => typeof str == "string" && /^(?:db:extension-|ext:):(?:.+)/.test(str))) pack[i][j][4].add(imgsrc);
					if (!pack[i][j][4].some(str => typeof str == "string" && /^die:(?:.+)/.test(str))) pack[i][j][4].add(audiosrc);
					if (pack[i][j][4].includes('boss') ||
						pack[i][j][4].includes('hiddenboss')) {
						lib.config.forbidai.add(j);
					}
					if (lib.config.forbidai_user && lib.config.forbidai_user.includes(j)) {
						lib.config.forbidai.add(j);
					}
					for (var l = 0; l < pack[i][j][3].length; l++) {
						lib.skilllist.add(pack[i][j][3][l]);
					}
				}
				else if (i == 'skill') {
					if (typeof pack[i][j].audio == 'number' || typeof pack[i][j].audio == 'boolean') {
						pack[i][j].audio = 'ext:' + extname + ':' + pack[i][j].audio;
					}
				}
				if (lib[i][j] == undefined) {
					lib[i][j] = pack[i][j];
				}
			}
		}
		let packname = 'mode_extension_' + packagename;
		lib.characterPack[packname] = pack.character;
		lib.translate[packname + '_character_config'] = packagename;
		if (gzFlag) lib.characterGuozhanFilter.add(packname);
	}
	/**
	 * @param { string } name 
	 * @param { Card } info 
	 * @param { { extension: string, translate: string, description: string, number?: number, color?: string } } info2 
	 */
	static addCard(name, info, info2) {
		var extname = (_status.extension || info2.extension);
		if (info.audio == true) {
			info.audio = 'ext:' + extname;
		}
		if (info.fullskin) {
			if (_status.evaluatingExtension) {
				info.image = 'db:extension-' + extname + ':' + name + '.png';
			}
			else {
				info.image = 'ext:' + extname + '/' + name + '.png';
			}
		}
		else if (info.fullimage) {
			if (_status.evaluatingExtension) {
				info.image = 'db:extension-' + extname + ':' + name + '.jpg';
			}
			else {
				info.image = 'ext:' + extname + '/' + name + '.jpg';
			}
		}
		lib.card[name] = info;
		lib.translate[name] = info2.translate;
		lib.translate[name + '_info'] = info2.description;
		if (typeof info2.number == 'number') {
			let suits = ['heart', 'spade', 'diamond', 'club'];
			if (info2.color == 'red') {
				suits = ['heart', 'diamond'];
			}
			else if (info2.color == 'black') {
				suits = ['club', 'spade'];
			}
			for (let i = 0; i < info2.number; i++) {
				lib.card.list.push([suits[Math.floor(Math.random() * suits.length)], Math.ceil(Math.random() * 13), name]);
			}
		}
		let packname = 'mode_extension_' + extname;
		if (!lib.cardPack[packname]) {
			lib.cardPack[packname] = [];
			lib.translate[packname + '_card_config'] = extname;
		}
		lib.cardPack[packname].push(name);
	}
	/**
	 * @param { { extension: string, mode?: string[], forbid?: string[], list: any[], card: {[key: string]: Card}, skill: { [key: string]: object }  } } pack 
	 * @param { string } [packagename] 
	 */
	static addCardPack(pack, packagename) {
		let extname = _status.extension || '扩展';
		packagename = packagename || extname;
		let packname = 'mode_extension_' + packagename;
		lib.cardPack[packname] = [];
		lib.translate[packname + '_card_config'] = packagename;
		for (let i in pack) {
			if (i == 'mode' || i == 'forbid') continue;
			if (i == 'list') {
				for (let j = 0; j < pack[i].length; j++) {
					lib.card.list.push(pack[i][j]);
				}
				continue;
			}
			for (let j in pack[i]) {
				if (i == 'card') {
					if (pack[i][j].audio == true) {
						pack[i][j].audio = 'ext:' + extname;
					}
					if (pack[i][j].fullskin) {
						if (_status.evaluatingExtension) {
							pack[i][j].image = 'db:extension-' + extname + ':' + j + '.png';
						}
						else {
							pack[i][j].image = 'ext:' + extname + '/' + j + '.png';
						}
					}
					else if (pack[i][j].fullimage) {
						if (_status.evaluatingExtension) {
							pack[i][j].image = 'db:extension-' + extname + ':' + j + '.jpg';
						}
						else {
							pack[i][j].image = 'ext:' + extname + '/' + j + '.jpg';
						}
					}
					lib.cardPack[packname].push(j);
				}
				else if (i == 'skill') {
					if (typeof pack[i][j].audio == 'number' || typeof pack[i][j].audio == 'boolean') {
						pack[i][j].audio = 'ext:' + extname + ':' + pack[i][j].audio;
					}
				}
				if (lib[i][j] == undefined) lib[i][j] = pack[i][j];
			}
		}
	}
	/**
	 * @param { string } name 
	 * @param { { [key: string]: object } } info 
	 * @param { string } [translate] 
	 * @param { string } [description] 
	 * @param { string } [appendInfo] 
	 * @param { string } [abInfo] 
	 */
	static addSkill(name, info, translate, description, appendInfo, abInfo) {
		if (lib.skill[name]) {
			return false;
		}
		if (typeof info.audio == 'number' || typeof info.audio == 'boolean') {
			info.audio = 'ext:' + _status.extension + ':' + info.audio;
		}
		lib.skill[name] = info;
		lib.translate[name] = translate;
		lib.translate[name + '_info'] = description;
		lib.translate[name + '_append'] = appendInfo;
		lib.translate[`${name}_ab`] = abInfo;
		return true;
	}
	/**
	 * @param { string } name 
	 * @param {*} info 
	 * @param { { translate: string, config: { [key: string]: object } } } info2 
	 */
	static addMode(name, info, info2) {
		lib.config.all.mode.push(name);
		lib.translate[name] = info2.translate;
		let imgsrc;
		let extname = _status.extension || info2.extension;
		if (_status.evaluatingExtension) {
			imgsrc = 'extension-' + extname + ':' + name + '.jpg';
		}
		else {
			imgsrc = 'ext:' + extname + '/' + name + '.jpg';
		}
		lib.mode[name] = {
			name: info2.translate,
			config: info2.config,
			splash: imgsrc,
			fromextension: true
		}
		lib.init['setMode_' + name] = async () => {
			await game.import('mode', (lib, game, ui, get, ai, _status) => {
				info.name = name;
				return info;
			});
		};
		if (!lib.config.extensionInfo[extname]) {
			lib.config.extensionInfo[extname] = {};
		}
		if (!lib.config.extensionInfo[extname].mode) {
			lib.config.extensionInfo[extname].mode = [];
		}
		if (lib.config.extensionInfo[extname].mode.indexOf(name) == -1) {
			lib.config.extensionInfo[extname].mode.push(name);
		}
		game.saveConfig('extensionMode', lib.config.extensionInfo);
	}
	/**
	 * @param { string } skill 
	 * @param { Player } [player] 
	 */
	static addGlobalSkill(skill, player) {
		let info = lib.skill[skill];
		if (!info) return false;
		lib.skill.global.add(skill);
		if (player) {
			if (!lib.skill.globalmap[skill]) {
				lib.skill.globalmap[skill] = [];
			}
			lib.skill.globalmap[skill].add(player);
		}
		if (info.trigger) {
			let setTrigger = function (i, evt) {
				let name = i + '_' + evt;
				if (!lib.hook.globalskill[name]) {
					lib.hook.globalskill[name] = [];
				}
				lib.hook.globalskill[name].add(skill);
				lib.hookmap[evt] = true;
			}
			for (let i in info.trigger) {
				if (typeof info.trigger[i] == 'string') {
					setTrigger(i, info.trigger[i]);
				}
				else if (Array.isArray(info.trigger[i])) {
					for (let j = 0; j < info.trigger[i].length; j++) {
						setTrigger(i, info.trigger[i][j]);
					}
				}
			}
		}
		return true;
	}
	/**
	 * @param { string } skill 
	 */
	static removeGlobalSkill(skill) {
		lib.skill.global.remove(skill);
		delete lib.skill.globalmap[skill];
		for (let i in lib.hook.globalskill) {
			lib.hook.globalskill[i].remove(skill);
		}
	}
	static resetSkills() {
		for (let i = 0; i < game.players.length; i++) {
			for (let j in game.players[i].tempSkills) {
				game.players[i].removeSkill(j);
			}
			let skills = game.players[i].getSkills();
			for (let j = 0; j < skills.length; j++) {
				if (lib.skill[skills[j]].vanish) {
					game.players[i].removeSkill(skills[j]);
				}
			}
			game.players[i].in(true);
		}
		ui.clear();
	}
	/**
	 * @param { string } extensionName
	 */
	static hasExtension(extensionName) {
		return this.hasExtensionInstalled(extensionName) && lib.config[`extension_${extensionName}_enable`];
	}
	/**
	 * @param { string } extensionName
	 */
	static hasExtensionInstalled(extensionName) {
		return lib.config.extensions.includes(extensionName);
	}
	/**
	 * @param { string } extensionName
	 */
	static hasExtensionLoaded(extensionName) {
		return extensionName !== void 0 && _status.extensionLoaded.includes(extensionName);
	}
	/**
	 * @param { string } extensionName 
	 * @param { Function } runnable 
	 */
	static runAfterExtensionLoaded(extensionName, runnable) {
		if (game.hasExtensionLoaded(extensionName)) {
			runnable();
		} else {
			let eventName = `Noname.Init.Extension.${extensionName}.onLoad`;
			let callback = () => {
				lib.announce.unsubscribe(eventName, callback);
				runnable();
			};
			lib.announce.subscribe(eventName, callback);
		}
	}
	/**
	 * @param { string } extensionName 
	 * @param { boolean } [keepFile] 
	 */
	static removeExtension(extensionName, keepFile) {
		const prefix = `extension_${extensionName}`;
		Object.keys(lib.config).forEach(key => {
			if (key.startsWith(prefix)) game.saveConfig(key);
		});
		localStorage.removeItem(`${lib.configprefix}${prefix}`);
		game.deleteDB('data', prefix);
		lib.config.extensions.remove(extensionName);
		game.saveConfig('extensions', lib.config.extensions);
		const modeList = lib.config.extensionInfo[extensionName];
		if (modeList) {
			if (modeList.file) Object.values(modeList.file).forEach(filePath => game.deleteDB('image', `extension-${extensionName}:${filePath}`));
			if (modeList.mode) Object.values(modeList.mode).forEach(game.clearModeConfig);
			delete lib.config.extensionInfo[extensionName];
			game.saveConfigValue('extensionInfo');
		}
		if (!game.download || keepFile) return;
		if (lib.node && lib.node.fs) try {
			const deleteFolderRecursive = path => {
				if (!lib.node.fs.existsSync(path)) return;
				lib.node.fs.readdirSync(path).forEach((file, index) => {
					const currentPath = `${path}/${file}`;
					if (lib.node.fs.lstatSync(currentPath).isDirectory()) deleteFolderRecursive(currentPath);
					else lib.node.fs.unlinkSync(currentPath);
				});
				lib.node.fs.rmdirSync(path);
			};
			deleteFolderRecursive(`${__dirname}/extension/${extensionName}`);
		}
			catch (error) {
				console.log(error);
			}
		else new Promise((resolve, reject) => window.resolveLocalFileSystemURL(`${lib.assetURL}extension/${extensionName}`, resolve, reject)).then(directoryEntry => directoryEntry.removeRecursively());
	}
	static addRecentCharacter() {
		let list = get.config('recentCharacter') || [];
		for (let i = 0; i < arguments.length; i++) {
			if (lib.character[arguments[i]]) {
				list.remove(arguments[i]);
				list.unshift(arguments[i]);
			}
		}
		let num = parseInt(lib.config.recent_character_number);
		if (list.length > num) {
			list.splice(num);
		}
		game.saveConfig('recentCharacter', list, true);
	}
	/**
	 * @overload
	 * @returns { Card }
	 */
	/**
	 * @overload
	 * @param { Card | string } name 
	 * @param { string } suit 
	 * @param { number } number 
	 * @param { string } nature 
	 */
	static createCard(name, suit, number, nature) {
		if (typeof name == 'object') {
			nature = name.nature;
			number = name.number;
			suit = name.suit;
			name = name.name;
		}
		if (typeof name != 'string') {
			name = 'sha';
		}
		let noclick = false;
		if (suit == 'noclick') {
			noclick = true;
			suit = null;
		}
		if (!suit && lib.card[name].cardcolor) {
			suit = lib.card[name].cardcolor;
		}
		if (!nature && lib.card[name].cardnature) {
			nature = lib.card[name].cardnature;
		}
		if (typeof suit != 'string') {
			suit = ['heart', 'diamond', 'club', 'spade'].randomGet();
		}
		else if (suit == 'black') {
			suit = Math.random() < 0.5 ? 'club' : 'spade';
		}
		else if (suit == 'red') {
			suit = Math.random() < 0.5 ? 'diamond' : 'heart';
		}
		if (typeof number != 'number' && typeof number != 'string') {
			number = Math.ceil(Math.random() * 13);
		}
		let card;
		if (noclick) {
			card = ui.create.card(ui.special, 'noclick', true);
		}
		else {
			card = ui.create.card(ui.special);
		}
		card.storage.vanish = true;
		return card.init([suit, number, name, nature]);
	}
	/**
	 * @overload
	 * @returns { Card }
	 */
	/**
	 * @overload
	 * @param { Card | string } name 
	 * @param { string } suit 
	 * @param { number } number 
	 * @param { string } nature 
	 */
	static createCard2() {
		let card = game.createCard.apply(this, arguments);
		delete card.storage.vanish;
		return card;
	}
	/**
	 * @param { boolean } bool 
	 * @param { Function } callback 
	 */
	static forceOver(bool, callback) {
		_status.event.next.length = 0;
		let next = game.createEvent('finish_game');
		next.bool = bool;
		next.callback = callback;
		next.setContent('forceOver');
		if (_status.paused) {
			game.uncheck();
			game.resume();
		}
	}
	/**
	 * @param { boolean | string } [result] 
	 * @param { boolean } [bool] 
	 * @returns 
	 */
	static over(result, bool) {
		if (_status.over) return;
		if (game.me._trueMe) game.swapPlayer(game.me._trueMe);
		let i, j, k, num, table, tr, td, dialog;
		_status.over = true;
		ui.control.show();
		ui.clear();
		game.stopCountChoose();
		if (ui.time3) {
			clearInterval(ui.time3.interval);
		}
		if ((game.layout == 'long2' || game.layout == 'nova') && !game.chess) {
			ui.arena.classList.add('choose-character');
			ui.me.hide();
			ui.mebg.hide()
			ui.autonode.hide();
			if (lib.config.radius_size != 'off') {
				ui.historybar.style.borderRadius = '0 0 0 4px';
			}
		}
		if (game.online) {
			let dialog = ui.create.dialog();
			dialog.noforcebutton = true;
			dialog.content.innerHTML = result;
			dialog.forcebutton = true;
			let result2 = arguments[1];
			if (result2 == true) {
				dialog.content.firstChild.innerHTML = '战斗胜利';
			}
			else if (result2 == false) {
				dialog.content.firstChild.innerHTML = '战斗失败';
			}
			ui.update();
			dialog.add(ui.create.div('.placeholder'));
			for (let i = 0; i < game.players.length; i++) {
				let hs = game.players[i].getCards('h');
				if (hs.length) {
					dialog.add('<div class="text center">' + get.translation(game.players[i]) + '</div>');
					dialog.addSmall(hs);
				}
			}

			for (let j = 0; j < game.dead.length; j++) {
				let hs = game.dead[j].getCards('h');
				if (hs.length) {
					dialog.add('<div class="text center">' + get.translation(game.dead[j]) + '</div>');
					dialog.addSmall(hs);
				}
			}

			dialog.add(ui.create.div('.placeholder.slim'));
			if (lib.config.background_audio) {
				if (result2 === true) {
					game.playAudio('effect', 'win');
				}
				else if (result2 === false) {
					game.playAudio('effect', 'lose');
				}
				else {
					game.playAudio('effect', 'tie');
				}
			}
			if (!ui.exit) {
				ui.create.exit();
			}
			if (ui.giveup) {
				ui.giveup.remove();
				delete ui.giveup;
			}
			if (game.servermode) {
				ui.exit.firstChild.innerHTML = '返回房间';
				setTimeout(function () {
					ui.exit.firstChild.innerHTML = '退出房间';
					_status.roomtimeout = true;
					lib.config.reconnect_info[2] = null;
					game.saveConfig('reconnect_info', lib.config.reconnect_info);
				}, 10000);
			}
			if (ui.tempnowuxie) {
				ui.tempnowuxie.close();
				delete ui.tempnowuxie;
			}
			if (ui.auto) ui.auto.hide();
			if (ui.wuxie) ui.wuxie.hide();
			if (game.getIdentityList) {
				for (let i = 0; i < game.players.length; i++) {
					game.players[i].setIdentity();
				}
			}
			return;
		}
		if (lib.config.background_audio) {
			if (result === true) {
				game.playAudio('effect', 'win');
			}
			else if (result === false) {
				game.playAudio('effect', 'lose');
			}
			else {
				game.playAudio('effect', 'tie');
			}
		}
		let resultbool = result;
		if (typeof resultbool !== 'boolean') {
			resultbool = null;
		}
		if (result === true) result = '战斗胜利';
		if (result === false) result = '战斗失败';
		if (result == undefined) result = '战斗结束';
		dialog = ui.create.dialog(result);
		dialog.noforcebutton = true;
		dialog.forcebutton = true;
		if (game.addOverDialog) {
			game.addOverDialog(dialog, result);
		}
		if (typeof _status.coin == 'number' && !_status.connectMode) {
			let coeff = Math.random() * 0.4 + 0.8;
			let added = 0;
			let betWin = false;
			if (result == '战斗胜利') {
				if (_status.betWin) {
					betWin = true;
					_status.coin += 10;
				}
				_status.coin += 20;
				if (_status.additionalReward) {
					_status.coin += _status.additionalReward();
				}
				switch (lib.config.mode) {
					case 'identity': {
						switch (game.me.identity) {
							case 'zhu': case 'zhong': case 'mingzhong':
								if (get.config('enhance_zhu')) {
									added = 10;
								}
								else {
									added = 20;
								}
								break;
							case 'fan':
								if (get.config('enhance_zhu')) {
									added = 16;
								}
								else {
									added = 8;
								}
								break;
							case 'nei':
								added = 40;
								break;
						}
						added = added * (game.players.length + game.dead.length) / 8;
						break;
					}
					case 'guozhan':
						if (game.me.identity == 'ye') {
							added = 8;
						}
						else {
							added = 5 / get.totalPopulation(game.me.identity);
						}
						added = added * (game.players.length + game.dead.length);
						break;
					case 'versus':
						if (_status.friend) {
							added = 5 * (game.players.length + _status.friend.length);
						}
						break;
					default:
						added = 10;
				}
			}
			else {
				added = 10;
			}
			if (lib.config.mode == 'chess' && _status.mode == 'combat' && get.config('additional_player')) {
				added = 2;
			}
			_status.coin += added * coeff;
			if (_status.coinCoeff) {
				_status.coin *= _status.coinCoeff;
			}
			_status.coin = Math.ceil(_status.coin);
			dialog.add(ui.create.div('', '获得' + _status.coin + '金'));
			if (betWin) {
				game.changeCoin(20);
				dialog.content.appendChild(document.createElement('br'));
				dialog.add(ui.create.div('', '（下注赢得10金）'));
			}
			game.changeCoin(_status.coin);
		}
		if (get.mode() == 'versus' && _status.ladder) {
			let mmr = _status.ladder_mmr;
			mmr += 10 - get.rank(game.me.name, true) * 2;
			if (result == '战斗胜利') {
				mmr = 20 + Math.round(mmr);
				if (mmr > 40) {
					mmr = 40;
				}
				else if (mmr < 10) {
					mmr = 10;
				}
				dialog.add(ui.create.div('', '获得 ' + mmr + ' 积分'));
			}
			else {
				mmr = -30 + Math.round(mmr / 2);
				if (mmr > -20) {
					mmr = -20;
				}
				else if (mmr < -35) {
					mmr = -35;
				}
				if (lib.storage.ladder.current < 900) {
					mmr = Math.round(mmr / 4);
				}
				else if (lib.storage.ladder.current < 1400) {
					mmr = Math.round(mmr / 2);
				}
				else if (lib.storage.ladder.current < 2000) {
					mmr = Math.round(mmr / 1.5);
				}
				else if (lib.storage.ladder.current > 2500) {
					mmr = Math.round(mmr * 1.5);
				}
				dialog.add(ui.create.div('', '失去 ' + (-mmr) + ' 积分'));
			}
			if (_status.ladder_tmp) {
				lib.storage.ladder.current += 40;
				delete _status.ladder_tmp;
			}
			lib.storage.ladder.current += mmr;
			if (lib.storage.ladder.top < lib.storage.ladder.current) {
				lib.storage.ladder.top = lib.storage.ladder.current;
			}
			game.save('ladder', lib.storage.ladder);
			if (ui.ladder && game.getLadderName) {
				ui.ladder.innerHTML = game.getLadderName(lib.storage.ladder.current);
			}
		}
		// if(true){
		if (game.players.length) {
			table = document.createElement('table');
			tr = document.createElement('tr');
			tr.appendChild(document.createElement('td'));
			td = document.createElement('td');
			td.innerHTML = '伤害';
			tr.appendChild(td);
			td = document.createElement('td');
			td.innerHTML = '受伤';
			tr.appendChild(td);
			td = document.createElement('td');
			td.innerHTML = '摸牌';
			tr.appendChild(td);
			td = document.createElement('td');
			td.innerHTML = '出牌';
			tr.appendChild(td);
			td = document.createElement('td');
			td.innerHTML = '杀敌';
			tr.appendChild(td);
			table.appendChild(tr);
			for (i = 0; i < game.players.length; i++) {
				tr = document.createElement('tr');
				td = document.createElement('td');
				td.innerHTML = get.translation(game.players[i]) + (game.players[i].ai.stratagem_camouflage ? '(被伪装)' : '');
				tr.appendChild(td);
				td = document.createElement('td');
				num = 0;
				for (j = 0; j < game.players[i].stat.length; j++) {
					if (game.players[i].stat[j].damage != undefined) num += game.players[i].stat[j].damage;
				}
				td.innerHTML = num;
				tr.appendChild(td);
				td = document.createElement('td');
				num = 0;
				for (j = 0; j < game.players[i].stat.length; j++) {
					if (game.players[i].stat[j].damaged != undefined) num += game.players[i].stat[j].damaged;
				}
				td.innerHTML = num;
				tr.appendChild(td);
				td = document.createElement('td');
				num = 0;
				for (j = 0; j < game.players[i].stat.length; j++) {
					if (game.players[i].stat[j].gain != undefined) num += game.players[i].stat[j].gain;
				}
				td.innerHTML = num;
				tr.appendChild(td);
				td = document.createElement('td');
				num = 0;
				for (j = 0; j < game.players[i].stat.length; j++) {
					for (k in game.players[i].stat[j].card) {
						num += game.players[i].stat[j].card[k];
					}
				}
				td.innerHTML = num;
				tr.appendChild(td);
				td = document.createElement('td');
				num = 0;
				for (j = 0; j < game.players[i].stat.length; j++) {
					if (game.players[i].stat[j].kill != undefined) num += game.players[i].stat[j].kill;
				}
				td.innerHTML = num;
				tr.appendChild(td);
				table.appendChild(tr);
			}
			dialog.add(ui.create.div('.placeholder'));
			dialog.content.appendChild(table);
		}
		if (game.dead.length) {
			table = document.createElement('table');
			table.style.opacity = '0.5';
			if (game.players.length == 0) {
				tr = document.createElement('tr');
				tr.appendChild(document.createElement('td'));
				td = document.createElement('td');
				td.innerHTML = '伤害';
				tr.appendChild(td);
				td = document.createElement('td');
				td.innerHTML = '受伤';
				tr.appendChild(td);
				td = document.createElement('td');
				td.innerHTML = '摸牌';
				tr.appendChild(td);
				td = document.createElement('td');
				td.innerHTML = '出牌';
				tr.appendChild(td);
				td = document.createElement('td');
				td.innerHTML = '杀敌';
				tr.appendChild(td);
				table.appendChild(tr);
			}
			for (i = 0; i < game.dead.length; i++) {
				tr = document.createElement('tr');
				td = document.createElement('td');
				td.innerHTML = get.translation(game.dead[i]) + (game.dead[i].ai.stratagem_camouflage ? '(被伪装)' : '');
				tr.appendChild(td);
				td = document.createElement('td');
				num = 0;
				for (j = 0; j < game.dead[i].stat.length; j++) {
					if (game.dead[i].stat[j].damage != undefined) num += game.dead[i].stat[j].damage;
				}
				td.innerHTML = num;
				tr.appendChild(td);
				td = document.createElement('td');
				num = 0;
				for (j = 0; j < game.dead[i].stat.length; j++) {
					if (game.dead[i].stat[j].damaged != undefined) num += game.dead[i].stat[j].damaged;
				}
				td.innerHTML = num;
				tr.appendChild(td);
				td = document.createElement('td');
				num = 0;
				for (j = 0; j < game.dead[i].stat.length; j++) {
					if (game.dead[i].stat[j].gain != undefined) num += game.dead[i].stat[j].gain;
				}
				td.innerHTML = num;
				tr.appendChild(td);
				td = document.createElement('td');
				num = 0;
				for (j = 0; j < game.dead[i].stat.length; j++) {
					for (k in game.dead[i].stat[j].card) {
						num += game.dead[i].stat[j].card[k];
					}
				}
				td.innerHTML = num;
				tr.appendChild(td);
				td = document.createElement('td');
				num = 0;
				for (j = 0; j < game.dead[i].stat.length; j++) {
					if (game.dead[i].stat[j].kill != undefined) num += game.dead[i].stat[j].kill;
				}
				td.innerHTML = num;
				tr.appendChild(td);
				table.appendChild(tr);
			}
			dialog.add(ui.create.div('.placeholder'));
			dialog.content.appendChild(table);
		}
		if (game.additionaldead && game.additionaldead.length) {
			table = document.createElement('table');
			table.style.opacity = '0.5';
			for (i = 0; i < game.additionaldead.length; i++) {
				tr = document.createElement('tr');
				td = document.createElement('td');
				td.innerHTML = get.translation(game.additionaldead[i]);
				tr.appendChild(td);
				td = document.createElement('td');
				num = 0;
				for (j = 0; j < game.additionaldead[i].stat.length; j++) {
					if (game.additionaldead[i].stat[j].damage != undefined) num += game.additionaldead[i].stat[j].damage;
				}
				td.innerHTML = num;
				tr.appendChild(td);
				td = document.createElement('td');
				num = 0;
				for (j = 0; j < game.additionaldead[i].stat.length; j++) {
					if (game.additionaldead[i].stat[j].damaged != undefined) num += game.additionaldead[i].stat[j].damaged;
				}
				td.innerHTML = num;
				tr.appendChild(td);
				td = document.createElement('td');
				num = 0;
				for (j = 0; j < game.additionaldead[i].stat.length; j++) {
					if (game.additionaldead[i].stat[j].gain != undefined) num += game.additionaldead[i].stat[j].gain;
				}
				td.innerHTML = num;
				tr.appendChild(td);
				td = document.createElement('td');
				num = 0;
				for (j = 0; j < game.additionaldead[i].stat.length; j++) {
					for (k in game.additionaldead[i].stat[j].card) {
						num += game.additionaldead[i].stat[j].card[k];
					}
				}
				td.innerHTML = num;
				tr.appendChild(td);
				td = document.createElement('td');
				num = 0;
				for (j = 0; j < game.additionaldead[i].stat.length; j++) {
					if (game.additionaldead[i].stat[j].kill != undefined) num += game.additionaldead[i].stat[j].kill;
				}
				td.innerHTML = num;
				tr.appendChild(td);
				table.appendChild(tr);
			}
			dialog.add(ui.create.div('.placeholder'));
			dialog.content.appendChild(table);
		}
		// }
		dialog.add(ui.create.div('.placeholder'));

		let clients = game.players.concat(game.dead);
		for (let i = 0; i < clients.length; i++) {
			if (clients[i].isOnline2()) {
				clients[i].send(game.over, dialog.content.innerHTML, game.checkOnlineResult(clients[i]));
			}
		}

		dialog.add(ui.create.div('.placeholder'));

		for (let i = 0; i < game.players.length; i++) {
			if (!_status.connectMode && game.players[i].isUnderControl(true) && game.layout != 'long2') continue;
			let hs = game.players[i].getCards('h');
			if (hs.length) {
				dialog.add('<div class="text center">' + get.translation(game.players[i]) + '</div>');
				dialog.addSmall(hs);
			}
		}
		for (let i = 0; i < game.dead.length; i++) {
			if (!_status.connectMode && game.dead[i].isUnderControl(true) && game.layout != 'long2') continue;
			let hs = game.dead[i].getCards('h');
			if (hs.length) {
				dialog.add('<div class="text center">' + get.translation(game.dead[i]) + '</div>');
				dialog.addSmall(hs);
			}
		}
		dialog.add(ui.create.div('.placeholder.slim'));
		game.addVideo('over', null, dialog.content.innerHTML);
		let vinum = parseInt(lib.config.video);
		if (!_status.video && vinum && game.getVideoName && window.indexedDB && _status.videoInited) {
			let store = lib.db.transaction(['video'], 'readwrite').objectStore('video');
			let videos = lib.videos.slice(0);
			for (let i = 0; i < videos.length; i++) {
				if (videos[i].starred) {
					videos.splice(i--, 1);
				}
			}
			for (let deletei = 0; deletei < 5; deletei++) {
				if (videos.length >= vinum) {
					let toremove = videos.pop();
					lib.videos.remove(toremove);
					store.delete(toremove.time);
				}
				else {
					break;
				}
			}
			let me = game.me || game.players[0];
			if (!me) return;
			let newvid = {
				name: game.getVideoName(),
				mode: lib.config.mode,
				video: lib.video,
				win: result == '战斗胜利',
				name1: me.name1 || me.name,
				name2: me.name2,
				time: lib.getUTC(new Date())
			};
			let modecharacters = lib.characterPack['mode_' + get.mode()];
			if (modecharacters) {
				if (get.mode() == 'guozhan') {
					if (modecharacters[newvid.name1]) {
						if (newvid.name1.startsWith('gz_shibing')) {
							newvid.name1 = newvid.name1.slice(3, 11);
						}
						else {
							newvid.name1 = newvid.name1.slice(3);
						}
					}
					if (modecharacters[newvid.name2]) {
						if (newvid.name2.startsWith('gz_shibing')) {
							newvid.name2 = newvid.name2.slice(3, 11);
						}
						else {
							newvid.name2 = newvid.name2.slice(3);
						}
					}
				}
				else {
					if (modecharacters[newvid.name1]) {
						newvid.name1 = get.mode() + '::' + newvid.name1;
					}
					if (modecharacters[newvid.name2]) {
						newvid.name2 = get.mode() + '::' + newvid.name2;
					}
				}
			}
			if (newvid.name1 && newvid.name1.startsWith('subplayer_')) {
				newvid.name1 = newvid.name1.slice(10, newvid.name1.lastIndexOf('_'));
			}
			if (newvid.name2 && newvid.name2.startsWith('subplayer_')) {
				newvid.name1 = newvid.name2.slice(10, newvid.name1.lastIndexOf('_'));
			}
			lib.videos.unshift(newvid);
			store.put(newvid);
			ui.create.videoNode(newvid, true);
		}
		// _status.auto=false;
		if (ui.auto) {
			// ui.auto.classList.remove('glow');
			ui.auto.hide();
		}
		if (ui.wuxie) ui.wuxie.hide();
		if (ui.giveup) {
			ui.giveup.remove();
			delete ui.giveup;
		}

		if (lib.config.test_game && !_status.connectMode) {
			if (typeof lib.config.test_game !== 'string') {
				switch (lib.config.mode) {
					case 'identity': game.saveConfig('mode', 'guozhan'); break;
					case 'guozhan': game.saveConfig('mode', 'versus'); break;
					case 'versus': game.saveConfig('mode', 'boss'); break;
					case 'boss': game.saveConfig('mode', 'chess'); break;
					case 'chess': game.saveConfig('mode', 'stone'); break;
					case 'stone': game.saveConfig('mode', 'identity'); break;
				}
			}
			setTimeout(game.reload, 500);
		}
		if (game.controlOver) {
			game.controlOver(); return;
		}
		if (!_status.brawl) {
			if (lib.config.mode == 'boss') {
				ui.create.control('再战', function () {
					let pointer = game.boss;
					let map = { boss: game.me == game.boss, links: [] };
					for (let iwhile = 0; iwhile < 10; iwhile++) {
						pointer = pointer.nextSeat;
						if (pointer == game.boss) {
							break;
						}
						if (!pointer.side) {
							map.links.push(pointer.name);
						}
					}
					game.saveConfig('continue_name_boss', map);
					game.saveConfig('mode', lib.config.mode);
					localStorage.setItem(lib.configprefix + 'directstart', true);
					game.reload();
				});
			}
			else if (lib.config.mode == 'versus') {
				if (_status.mode == 'standard' || _status.mode == 'three') {
					ui.create.control('再战', function () {
						game.saveConfig('continue_name_versus' + (_status.mode == 'three' ? '_three' : ''), {
							friend: _status.friendBackup,
							enemy: _status.enemyBackup,
							color: _status.color
						});
						game.saveConfig('mode', lib.config.mode);
						localStorage.setItem(lib.configprefix + 'directstart', true);
						game.reload();
					});
				}
			}
			else if (!_status.connectMode && get.config('continue_game') && !ui.continue_game && !_status.brawl && !game.no_continue_game) {
				ui.continue_game = ui.create.control('再战', game.reloadCurrent);
			}
		}
		if (!ui.restart) {
			if (game.onlineroom && typeof game.roomId == 'string') {
				ui.restart = ui.create.control('restart', function () {
					game.broadcastAll(function () {
						if (ui.exit) {
							ui.exit.stay = true;
							ui.exit.firstChild.innerHTML = '返回房间';
						}
					});
					game.saveConfig('tmp_owner_roomId', game.roomId);
					setTimeout(game.reload, 100);
				});
			}
			else {
				ui.restart = ui.create.control('restart', game.reload);
			}
		}
		if (ui.tempnowuxie) {
			ui.tempnowuxie.close();
			delete ui.tempnowuxie;
		}

		if (ui.revive) {
			ui.revive.close();
			delete ui.revive;
		}
		if (ui.swap) {
			ui.swap.close();
			delete ui.swap;
		}
		for (let i = 0; i < lib.onover.length; i++) {
			lib.onover[i](resultbool);
		}
		if (game.addRecord) {
			game.addRecord(resultbool);
		}
		if (window.isNonameServer) {
			lib.configOL.gameStarted = false;
			game.saveConfig('pagecfg' + window.isNonameServer, [lib.configOL, game.roomId, _status.onlinenickname, _status.onlineavatar]);
			game.reload();
		}
		else if (_status.connectMode && !game.online) {
			setTimeout(game.reload, 15000)
		}
	}
	/**
	 * @type { Map<GameEvent, Promise<any>> }
	 * 
	 * 以Promise储存异步事件的执行链，使async content调用事件时无需必须使用await
	 * 
	 * 但是需要事件结果的除外
	 */
	static executingAsyncEventMap = new Map();
	/**
	 * @param { GameEventPromise } [belongAsyncEvent]
	 */
	static async loop(belongAsyncEvent) {
		if (!game.belongAsyncEventList) game.belongAsyncEventList = [];
		if (belongAsyncEvent) {
			game.belongAsyncEventList.push(belongAsyncEvent);
		} else if (game.belongAsyncEventList.length) {
			belongAsyncEvent = game.belongAsyncEventList.at(-1);
		}
		while (true) {
			let event = (belongAsyncEvent && belongAsyncEvent.parent == _status.event) ? belongAsyncEvent : _status.event;
			let { step, source, player, target, targets, card, cards, skill, forced, num, _trigger: trigger, _result: result } = event;
			const _resolve = () => {
				if (event.async) {
					if (typeof event.resolve == 'function') {
						event.resolve(event.toEvent());
					} else {
						throw new TypeError('异步事件的event.resolve未赋值，使用await时将会被永久等待');
					}
				}
			};
			if (_status.paused2 || _status.imchoosing) {
				if (!lib.status.dateDelaying) {
					lib.status.dateDelaying = new Date();
				}
			}
			if (_status.paused || _status.paused2 || _status.over) {
				return;
			}
			if (_status.paused3) {
				_status.paused3 = 'paused';
				return;
			}
			if (lib.status.dateDelaying) {
				lib.status.dateDelayed += lib.getUTC(new Date()) - lib.getUTC(lib.status.dateDelaying);
				delete lib.status.dateDelaying;
			}
			if (event.next.length > 0) {
				var next = event.next.shift();
				if (next.player && next.player.skipList.includes(next.name)) {
					event.trigger(next.name + 'Skipped');
					next.player.skipList.remove(next.name);
					if (lib.phaseName.includes(next.name)) next.player.getHistory('skipped').add(next.name);
				}
				else {
					next.parent = event;
					_status.event = next;
					game.getGlobalHistory('everything').push(next);
				}
			}
			else if (event.finished) {
				if (event._triggered == 1) {
					if (event.type == 'card') event.trigger('useCardToOmitted');
					event.trigger(event.name + 'Omitted');
					event._triggered = 4;
				}
				else if (event._triggered == 2) {
					if (event.type == 'card') event.trigger('useCardToEnd');
					event.trigger(event.name + 'End');
					event._triggered = 3;
				}
				else if (event._triggered == 3) {
					if (event.type == 'card') event.trigger('useCardToAfter');
					event.trigger(event.name + 'After');
					event._triggered++;
				}
				else if (event.after && event.after.length) {
					var next = event.after.shift();
					if (next.player && next.player.skipList.includes(next.name)) {
						event.trigger(next.name + 'Skipped');
						next.player.skipList.remove(next.name);
						if (lib.phaseName.includes(next.name)) next.player.getHistory('skipped').add(next.name)
					}
					else {
						next.parent = event;
						_status.event = next;
						game.getGlobalHistory('everything').push(next);
					}
				}
				else {
					game.executingAsyncEventMap.delete(event.toEvent());
					if (event.parent) {
						if (event.result) {
							event.parent._result = event.result;
						}
						_status.event = event.parent;
						if (game.belongAsyncEventList.includes(event)) {
							game.belongAsyncEventList.remove(event);
						}
						_resolve();
						// 此时应该退出了
						if (belongAsyncEvent && belongAsyncEvent.parent == _status.event) {
							return;
						}
					}
					else {
						if (game.belongAsyncEventList.includes(event)) {
							game.belongAsyncEventList.remove(event);
						}
						return _resolve();
					}
				}
			}
			else {
				if (event._triggered == 0) {
					if (event.type == 'card') event.trigger('useCardToBefore');
					event.trigger(event.name + 'Before');
					event._triggered++;
				}
				else if (event._triggered == 1) {
					if (event.type == 'card') event.trigger('useCardToBegin');
					event.trigger(event.name + 'Begin');
					event._triggered++;
				}
				else {
					event.callHandler(event.getDefaultHandlerType(), event, {
						state: 'begin'
					});
					const after = () => {
						event.clearStepCache();
						event.callHandler(event.getDefaultHandlerType(), event, {
							state: 'end'
						});
						if (typeof event.step == "number") ++event.step;
					};
					if (player && player.classList.contains('dead') && !event.forceDie && event.name != 'phaseLoop') {
						game.broadcastAll(function () {
							while (_status.dieClose.length) {
								_status.dieClose.shift().close();
							}
						});
						if (event._oncancel) {
							event._oncancel();
						}
						event.finish();
						after();
					}
					else if (player && player.removed && event.name != 'phaseLoop') {
						event.finish();
						after();
					}
					else if (player && player.isOut() && event.name != 'phaseLoop' && !event.includeOut) {
						if (event.name == 'phase' && player == _status.roundStart && !event.skill) {
							_status.roundSkipped = true;
						}
						event.finish();
						after();
					}
					else {
						await game.runContent(belongAsyncEvent).catch(e => {
							if (_status.withError || lib.config.compatiblemode || (_status.connectMode && !lib.config.debug)) {
								game.print('游戏出错：' + event.name);
								game.print(e.toString());
								console.log(e);
							}
							else throw e;
						}).then(after).then(() => {
							if (event.finished) {
								game.executingAsyncEventMap.delete(event.toEvent());
							}
						});
					}
				}
			}
		}
	}
	/**
	 * @param { GameEventPromise } [belongAsyncEvent]
	 */
	static runContent(belongAsyncEvent) {
		return new Promise(resolve => {
			let event = (belongAsyncEvent && belongAsyncEvent.parent == _status.event) ? belongAsyncEvent : _status.event;
			let { step, source, player, target, targets, card, cards, skill, forced, num, _trigger: trigger, _result: result, _storeEvent } = event;
			// 数组形式
			if ("contents" in event && Array.isArray(event.contents)) {
				/*
				event.contents[step](event, trigger, player, _storeEvent).then((evt) => {
					if (evt) event._storeEvent = evt;
					if (game.executingAsyncEventMap.has(event.toEvent())) {
						game.executingAsyncEventMap.set(_status.event.toEvent(), game.executingAsyncEventMap.get(_status.event.toEvent()).then(() => {
							if (event.step >= event.contents.length - 1) event.finish();
							resolve();
						}));
					} else {
						if (event.step >= event.contents.length - 1) event.finish();
						resolve();
					}
				});
				*/
				// 解决不了问题...就把问题统一
				const run = async (event) => {
					if (typeof event.step !== "number") event.step = 0;
					while (event.step < event.contents.length && !event.finished) {
						const evt = await event.contents[event.step](event, event._trigger, event.player, event._tmpStoreEvent);
						if (evt) event._tmpStoreEvent = evt;

						if (game.executingAsyncEventMap.has(event.toEvent())) {
							await game.executingAsyncEventMap.get(_status.event.toEvent());
							await game.executingAsyncEventMap.get(event.toEvent());
						}

						++event.step;
					}
					--event.step;
				};

				run(event).then(() => {
					// 其实这个if几乎一定执行了
					if (game.executingAsyncEventMap.has(event.toEvent())) {
						game.executingAsyncEventMap.set(_status.event.toEvent(), game.executingAsyncEventMap.get(_status.event.toEvent()).then(() => {
							event.finish();
							resolve();
						}));
					} else {
						event.finish();
						resolve();
					}
				});
			}
			else if (event.content instanceof GeneratorFunction) {
				if (!event.debugging) {
					if (event.generatorContent) event.generatorContent.return();
					event.generatorContent = event.content(event, step, source, player, target, targets,
						card, cards, skill, forced, num, trigger, result,
						_status, lib, game, ui, get, ai);
				} else {
					delete event.debugging;
				}
				var next = event.generatorContent.next();
				if (typeof next.value == 'function' && next.value.toString() == 'code=>eval(code)') {
					//触发debugger
					var inputCallback = inputResult => {
						if (inputResult === false) {
							event.debugging = true;
							game.resume2();
						} else {
							alert(get.stringify(next.value(inputResult)));
							game.prompt('', 'debugger调试', inputCallback);
						}
					}
					game.prompt('', 'debugger调试', inputCallback);
					return game.pause2();
				}
				if (event.finished) event.generatorContent.return();
				resolve();
			}
			else if (event.content instanceof AsyncFunction) {
				// _status,lib,game,ui,get,ai六个变量由game.import提供
				event.content(event, trigger, player).then(() => {
					// 其实这个if几乎一定执行了
					if (game.executingAsyncEventMap.has(event.toEvent())) {
						game.executingAsyncEventMap.set(_status.event.toEvent(), game.executingAsyncEventMap.get(_status.event.toEvent()).then(() => {
							event.finish();
							resolve();
						}));
					} else {
						event.finish();
						resolve();
					}
				});
			}
			else {
				event.content(event, step, source, player, target, targets,
					card, cards, skill, forced, num, trigger, result,
					_status, lib, game, ui, get, ai);
				resolve();
			}
		});
	}
	static pause() {
		clearTimeout(_status.timeout);
		_status.paused = true;
	}
	static pause2() {
		if (_status.connectMode) return;
		_status.paused2 = true;
	}
	static resume() {
		if (_status.paused) {
			if (!_status.noclearcountdown) {
				game.stopCountChoose();
			}
			_status.paused = false;
			delete _status.waitingForTransition;
			game.loop();
		}
	}
	static resume2() {
		if (_status.connectMode) return;
		if (_status.paused2) {
			_status.paused2 = false;
			game.loop();
		}
	}
	static delaye() {
		let next = game.createEvent('delay', false);
		next.setContent('delay');
		next._args = Array.from(arguments);
		return next;
	}
	static delayex() {
		let next = game.createEvent('delayx', false);
		next.setContent('delay');
		next._args = Array.from(arguments);
		return next;
	}
	/**
	 * @param { number } [time] 
	 * @param { number } [time2] 
	 */
	static delay(time, time2) {
		if (_status.paused) return;
		game.pause();
		if (typeof time != 'number') time = 1;
		if (typeof time2 != 'number') time2 = 0;
		time = time * lib.config.duration + time2;
		if (lib.config.speed == 'vvfast') time /= 3;
		_status.timeout = setTimeout(game.resume, time);
	}
	/**
	 * @param { number } [time] 
	 * @param { number } [time2] 
	 */
	static delayx(time, time2) {
		if (typeof time != 'number') time = 1;
		switch (lib.config.game_speed) {
			case 'vslow': time *= 2.5; break;
			case 'slow': time *= 1.5; break;
			case 'fast': time *= 0.7; break;
			case 'vfast': time *= 0.4; break;
			case 'vvfast': time *= 0.2; break;
		}
		return game.delay(time, time2);
	}
	/**
	 * 在async content中对game.delay的代替使用方法
	 * 
	 * 因为async content里不应该使用game.pause和game.resume
	 * 
	 * @param { number } [time] 
	 * @param { number } [time2] 
	 */
	static asyncDelay(time, time2) {
		// if(_status.paused) return;
		// game.pause();
		if (typeof time != 'number') time = 1;
		if (typeof time2 != 'number') time2 = 0;
		time = time * lib.config.duration + time2;
		if (lib.config.speed == 'vvfast') time /= 3;
		//_status.timeout=setTimeout(game.resume,time);
		return delay(time);
	}
	/**
	 * 在async content中对game.delayx的代替使用方法
	 * 
	 * 因为async content里不应该使用game.pause和game.resume
	 * 
	 * @param { number } [time] 
	 * @param { number } [time2] 
	 */
	static asyncDelayx(time, time2) {
		if (typeof time != 'number') time = 1;
		switch (lib.config.game_speed) {
			case 'vslow': time *= 2.5; break;
			case 'slow': time *= 1.5; break;
			case 'fast': time *= 0.7; break;
			case 'vfast': time *= 0.4; break;
			case 'vvfast': time *= 0.2; break;
		}
		return game.asyncDelay(time, time2);
	}
	/**
	 * @param { GameEventPromise } [event] 
	 */
	static check(event) {
		let i, range;
		if (event == undefined) event = _status.event;
		event._checked = true;
		let custom = event.custom || {};
		let ok = true, auto = true;
		let player = event.player;
		let auto_confirm = lib.config.auto_confirm;
		let players = game.players.slice(0);
		if (event.deadTarget) players.addArray(game.dead);
		if (!event.filterButton && !event.filterCard && !event.filterTarget && (!event.skill || !event._backup)) {
			if (event.choosing) {
				_status.imchoosing = true;
			}
			return;
		}
		player.node.equips.classList.remove('popequip');
		if (event.filterButton) {
			let dialog = event.dialog;
			range = get.select(event.selectButton);
			let selectableButtons = false;
			if (event.forceAuto && ui.selected.buttons.length == range[1]) auto = true;
			else if (range[0] != range[1] || range[0] > 1) auto = false;
			for (i = 0; i < dialog.buttons.length; i++) {
				if (dialog.buttons[i].classList.contains('unselectable')) continue;
				if (event.filterButton(dialog.buttons[i], player) && lib.filter.buttonIncluded(dialog.buttons[i])) {
					if (ui.selected.buttons.length < range[1]) {
						dialog.buttons[i].classList.add('selectable');
					}
					else if (range[1] <= -1) {
						dialog.buttons[i].classList.add('selected');
						ui.selected.buttons.add(dialog.buttons[i]);
					}
					else {
						dialog.buttons[i].classList.remove('selectable');
					}
				}
				else {
					dialog.buttons[i].classList.remove('selectable');
					if (range[1] <= -1) {
						dialog.buttons[i].classList.remove('selected');
						ui.selected.buttons.remove(dialog.buttons[i]);
					}
				}
				if (dialog.buttons[i].classList.contains('selected')) {
					dialog.buttons[i].classList.add('selectable');
				}
				else if (!selectableButtons && dialog.buttons[i].classList.contains('selectable')) {
					selectableButtons = true;
				}
			}
			if (ui.selected.buttons.length < range[0]) {
				if (!event.forced || selectableButtons) {
					ok = false;
				}
				if (event.complexSelect || event.getParent().name == 'chooseCharacter' || event.getParent().name == 'chooseButtonOL') {
					ok = false;
				}
			}
			if (custom.add.button) {
				custom.add.button();
			}
		}
		if (event.filterCard) {
			if (ok == false) {
				game.uncheck('card');
			}
			else {
				let cards = player.getCards(event.position);
				let firstCheck = false;
				range = get.select(event.selectCard);
				if (!event._cardChoice && typeof event.selectCard != 'function' &&
					!event.complexCard && range[1] > -1 && !lib.config.compatiblemode) {
					event._cardChoice = [];
					firstCheck = true;
				}
				if (event.isMine() && event.name == 'chooseToUse' && event.parent.name == 'phaseUse' && !event.skill &&
					!event._targetChoice && !firstCheck && !lib.config.compatiblemode) {
					event._targetChoice = new Map();
					for (let i = 0; i < event._cardChoice.length; i++) {
						if (!lib.card[event._cardChoice[i].name].complexTarget) {
							let targets = [];
							for (let j = 0; j < players.length; j++) {
								if (event.filterTarget(event._cardChoice[i], player, players[j])) {
									targets.push(players[j]);
								}
							}
							event._targetChoice.set(event._cardChoice[i], targets);
						}
					}
				}
				let selectableCards = false;
				if (range[0] != range[1] || range[0] > 1) auto = false;
				for (i = 0; i < cards.length; i++) {
					if (lib.config.cardtempname != 'off') {
						let cardname = get.name(cards[i]);
						if (cards[i].name != cardname || !get.is.sameNature(get.nature(cards[i]), cards[i].nature, true)) {
							let node = ui.create.cardTempName(cards[i]);
							let cardtempnameConfig = lib.config.cardtempname;
							if (cardtempnameConfig !== 'default') node.classList.remove('vertical');
						}
					}
					let nochess = true;
					if (!lib.filter.cardAiIncluded(cards[i])) {
						nochess = false;
					}
					else if (event._cardChoice && !firstCheck) {
						if (!event._cardChoice.includes(cards[i])) {
							nochess = false;
						}
					}
					else {
						if (player.isOut() || !lib.filter.cardRespondable(cards[i], player) ||
							cards[i].classList.contains('uncheck') ||
							!event.filterCard(cards[i], player)) {
							nochess = false;
						}
					}
					if (nochess) {
						if (ui.selected.cards.length < range[1]) {
							cards[i].classList.add('selectable');
							if (event._cardChoice && firstCheck) {
								event._cardChoice.push(cards[i]);
							}
						}
						else if (range[1] <= -1) {
							cards[i].classList.add('selected');
							cards[i].updateTransform(true);
							ui.selected.cards.add(cards[i]);
						}
						else {
							cards[i].classList.remove('selectable');
						}
					}
					else {
						cards[i].classList.remove('selectable');
						if (range[1] <= -1) {
							cards[i].classList.remove('selected');
							cards[i].updateTransform();
							ui.selected.cards.remove(cards[i]);
						}
					}
					if (cards[i].classList.contains('selected')) {
						cards[i].classList.add('selectable');
					}
					else if (!selectableCards && cards[i].classList.contains('selectable')) {
						selectableCards = true;
					}
				}
				if (ui.selected.cards.length < range[0]) {
					if (!event.forced || selectableCards || event.complexSelect) {
						ok = false;
					}
				}

				if (lib.config.popequip && get.is.phoneLayout() &&
					typeof event.position == 'string' && event.position.includes('e') &&
					player.node.equips.querySelector('.card.selectable')) {
					player.node.equips.classList.add('popequip');
					auto_confirm = false;
				}
			}
			if (custom.add.card) {
				custom.add.card();
			}
		}
		if (event.filterTarget) {
			if (ok == false) {
				game.uncheck('target');
			}
			else {
				let card = get.card();
				let firstCheck = false;
				range = get.select(event.selectTarget);
				let selectableTargets = false;
				if (range[0] != range[1] || range[0] > 1) auto = false;
				for (i = 0; i < players.length; i++) {
					let nochess = true;
					if (game.chess && !event.chessForceAll && player && get.distance(player, players[i], 'pure') > 7) {
						nochess = false;
					}
					else if (players[i].isOut()) {
						nochess = false;
					}
					else if (event._targetChoice && event._targetChoice.has(card)) {
						let targetChoice = event._targetChoice.get(card);
						if (!Array.isArray(targetChoice) || !targetChoice.includes(players[i])) {
							nochess = false;
						}
					}
					else if (!event.filterTarget(card, player, players[i])) {
						nochess = false;
					}
					if (nochess) {
						if (ui.selected.targets.length < range[1]) {
							players[i].classList.add('selectable');
							if (Array.isArray(event._targetChoice)) {
								event._targetChoice.push(players[i]);
							}
						}
						else if (range[1] <= -1) {
							players[i].classList.add('selected');
							ui.selected.targets.add(players[i]);
						}
						else {
							players[i].classList.remove('selectable');
						}
					}
					else {
						players[i].classList.remove('selectable');
						if (range[1] <= -1) {
							players[i].classList.remove('selected');
							ui.selected.targets.remove(players[i]);
						}
					}
					if (players[i].classList.contains('selected')) {
						players[i].classList.add('selectable');
					}
					else if (!selectableTargets && players[i].classList.contains('selectable')) {
						selectableTargets = true;
					}
					if (players[i].instance) {
						if (players[i].classList.contains('selected')) {
							players[i].instance.classList.add('selected');
						}
						else {
							players[i].instance.classList.remove('selected');
						}
						if (players[i].classList.contains('selectable')) {
							players[i].instance.classList.add('selectable');
						}
						else {
							players[i].instance.classList.remove('selectable');
						}
					}
				}
				if (ui.selected.targets.length < range[0]) {
					if (!event.forced || selectableTargets || event.complexSelect) {
						ok = false;
					}
				}
				if (range[1] <= -1 && ui.selected.targets.length == 0 && event.targetRequired) {
					ok = false;
				}
			}
			if (custom.add.target) {
				custom.add.target();
			}
		}
		if (!event.skill && get.noSelected() && !_status.noconfirm) {
			const skills = [];
			if (event._skillChoice) {
				let skills2 = event._skillChoice;
				for (let i = 0; i < skills2.length; i++) {
					if (event.isMine() || !event._aiexclude.includes(skills2[i])) {
						skills.push(skills2[i]);
					}
				}
			}
			else {
				let skills2;
				if (get.mode() == 'guozhan' && player.hasSkillTag('nomingzhi', false, null, true)) {
					skills2 = player.getSkills(false, true, false);
				}
				else {
					skills2 = player.getSkills('invisible', true, false);
				}
				skills2 = game.filterSkills(skills2.concat(lib.skill.global), player, player.getSkills('e').concat(lib.skill.global));
				event._skillChoice = [];
				game.expandSkills(skills2);
				for (let i = 0; i < skills2.length; i++) {
					const info = get.info(skills2[i]);
					if (!info) throw new ReferenceError(`Cannot find ${skills2[i]} in lib.skill`);
					let enable = false;
					if (typeof info.enable == 'function') enable = info.enable(event);
					else if (Array.isArray(info.enable)) enable = info.enable.includes(event.name);
					else if (info.enable == 'phaseUse') enable = (event.type == 'phase');
					else if (typeof info.enable == 'string') enable = (info.enable == event.name);
					if (enable) {
						if (!game.expandSkills(player.getSkills(false).concat(lib.skill.global)).includes(skills2[i]) && (info.noHidden || get.mode() != 'guozhan' || player.hasSkillTag('nomingzhi', false, null, true))) enable = false;
						if (info.filter && !info.filter(event, player)) enable = false;
						if (info.viewAs && typeof info.viewAs != 'function' && event.filterCard && !event.filterCard(info.viewAs, player, event)) enable = false;
						if (info.viewAs && typeof info.viewAs != 'function' && info.viewAsFilter && info.viewAsFilter(player) == false) enable = false;
						if (info.usable && get.skillCount(skills2[i]) >= info.usable) enable = false;
						if (info.chooseButton && _status.event.noButton) enable = false;
						if (info.round && (info.round - (game.roundNumber - player.storage[skills2[i] + '_roundcount']) > 0)) enable = false;
						for (const item in player.storage) {
							if (item.startsWith('temp_ban_')) {
								if(player.storage[item] !== true) continue;
								const skillName = item.slice(9);
								if (lib.skill[skillName]) {
									const skills=game.expandSkills([skillName]);
									if(skills.includes(skills2[i])) {
										enable = false; break;
									}
								}
							}
						}
					}
					if (enable) {
						if (event.isMine() || !event._aiexclude.includes(skills2[i])) {
							skills.add(skills2[i]);
						}
						event._skillChoice.add(skills2[i]);
					}
				}
			}

			let globalskills = [];
			let globallist = lib.skill.global.slice(0);
			game.expandSkills(globallist);
			for (let i = 0; i < skills.length; i++) {
				if (globallist.includes(skills[i])) {
					globalskills.push(skills.splice(i--, 1)[0]);
				}
			}
			let equipskills = [];
			let ownedskills = player.getSkills('invisible', false);
			game.expandSkills(ownedskills);
			for (let i = 0; i < skills.length; i++) {
				if (!ownedskills.includes(skills[i])) {
					equipskills.push(skills.splice(i--, 1)[0]);
				}
			}
			if (equipskills.length) {
				ui.create.skills3(equipskills);
			}
			else if (ui.skills3) {
				ui.skills3.close();
			}
			if (skills.length) {
				ui.create.skills(skills);
			}
			else if (ui.skills) {
				ui.skills.close();
			}
			if (globalskills.length) {
				ui.create.skills2(globalskills);
			}
			else if (ui.skills2) {
				ui.skills2.close();
			}
		}
		else {
			if (ui.skills) {
				ui.skills.close()
			}
			if (ui.skills2) {
				ui.skills2.close()
			}
			if (ui.skills3) {
				ui.skills3.close()
			}
		}
		_status.multitarget = false;
		let skillinfo = get.info(_status.event.skill);
		if (_status.event.name == 'chooseToUse') {
			if (skillinfo && skillinfo.multitarget && !skillinfo.multiline) {
				_status.multitarget = true;
			}
			if ((skillinfo && skillinfo.viewAs && typeof skillinfo.viewAs != 'function') || !_status.event.skill) {
				let cardinfo = get.info(get.card());
				if (cardinfo && (cardinfo.multitarget || cardinfo.complexSelect) && !cardinfo.multiline) {
					_status.multitarget = true;
				}
			}
		}
		else if (_status.event.multitarget) {
			_status.multitarget = true;
		}
		if (event.isMine()) {
			if (game.chess && game.me && get.config('show_distance')) {
				for (let i = 0; i < players.length; i++) {
					if (players[i] == game.me) {
						players[i].node.action.hide();
					}
					else {
						players[i].node.action.show();
						let dist = get.distance(game.me, players[i], 'pure');
						let dist2 = get.distance(game.me, players[i]);
						players[i].node.action.innerHTML = '距离：' + dist2 + '/' + dist;
						if (dist > 7) {
							players[i].node.action.classList.add('thunder');
						}
						else {
							players[i].node.action.classList.remove('thunder');
						}
					}
				}
			}
			if (ok && (!event.filterOk || event.filterOk()) && auto && (auto_confirm || (skillinfo && skillinfo.direct)) && (!_status.mousedragging || !_status.mouseleft) &&
				!_status.mousedown && !_status.touchnocheck) {
				if (ui.confirm) {
					if (!skillinfo || !skillinfo.preservecancel) {
						ui.confirm.close();
					}
				}
				if (skillinfo && skillinfo.preservecancel && !ui.confirm) {
					ui.create.confirm('c');
				}
				if (event.skillDialog == true) event.skillDialog = false;
				ui.click.ok();
				_status.mousedragging = null;
			}
			else {
				ui.arena.classList.add('selecting');
				if (event.filterTarget && (!event.filterCard || !event.position || (typeof event.position == 'string' && event.position.indexOf('e') == -1))) {
					ui.arena.classList.add('tempnoe');
				}
				game.countChoose();
				if (!_status.noconfirm && !_status.event.noconfirm) {
					if (!_status.mousedown || _status.mouseleft) {
						let str = '';
						if (ok && (!event.filterOk || event.filterOk())) str += 'o';
						if (!event.forced && !event.fakeforce && get.noSelected()) str += 'c';
						ui.create.confirm(str);
					}
				}
			}
			if (ui.confirm && ui.confirm.lastChild.link == 'cancel') {
				if (_status.event.type == 'phase' && !_status.event.skill) {
					ui.confirm.lastChild.innerHTML = '结束';
				}
				else {
					ui.confirm.lastChild.innerHTML = '取消';
				}
			}
		}
		return ok;
	}
	static uncheck(...args) {
		let i, j;
		if (game.chess) {
			let shadows = ui.chessContainer.getElementsByClassName('playergrid temp');
			while (shadows.length) {
				shadows[0].remove();
			}
		}
		if ((args.length == 0 || args.includes('card')) && _status.event.player) {
			let cards = _status.event.player.getCards('hejsx');
			for (j = 0; j < cards.length; j++) {
				cards[j].classList.remove('selected');
				cards[j].classList.remove('selectable');
				if (cards[j]._tempName) {
					cards[j]._tempName.delete();
					delete cards[j]._tempName;
				}
				cards[j].updateTransform();
			}
			ui.selected.cards.length = 0;
			_status.event.player.node.equips.classList.remove('popequip');
		}
		let players = game.players.slice(0);
		if (_status.event.deadTarget) players.addArray(game.dead);
		if ((args.length == 0 || args.includes('target'))) {
			for (j = 0; j < players.length; j++) {
				players[j].classList.remove('selected');
				players[j].classList.remove('selectable');
				if (players[j].instance) {
					players[j].instance.classList.remove('selected');
					players[j].instance.classList.remove('selectable');
				}
			}
			ui.selected.targets.length = 0;
		}
		if ((args.length == 0 || args.includes('button')) && _status.event.dialog && _status.event.dialog.buttons) {
			for (let j = 0; j < _status.event.dialog.buttons.length; j++) {
				_status.event.dialog.buttons[j].classList.remove('selectable');
				_status.event.dialog.buttons[j].classList.remove('selected');
			}
			ui.selected.buttons.length = 0;
		}
		if (args.length == 0) {
			ui.arena.classList.remove('selecting');
			ui.arena.classList.remove('tempnoe');
			_status.imchoosing = false;
			_status.lastdragchange.length = 0;
			_status.mousedragging = null;
			_status.mousedragorigin = null;

			while (ui.touchlines.length) {
				ui.touchlines.shift().delete();
			}
		}
		ui.canvas.width = ui.arena.offsetWidth;
		ui.canvas.height = ui.arena.offsetHeight;
		for (let i = 0; i < players.length; i++) {
			players[i].unprompt();
		}
		for (let i = 0; i < _status.dragline.length; i++) {
			if (_status.dragline[i]) _status.dragline[i].remove();
		}
		ui.arena.classList.remove('dragging');
		_status.dragline.length = 0;
	}
	/**
	 * @param { Player } player1 
	 * @param { Player } player2 
	 * @param { boolean } [prompt] 
	 * @param { boolean } [behind] 
	 * @param { boolean } [noanimate] 
	 */
	static swapSeat(player1, player2, prompt, behind, noanimate) {
		if (noanimate) {
			player1.style.transition = 'all 0s';
			player2.style.transition = 'all 0s';
			ui.refresh(player1);
			ui.refresh(player2);
		}
		if (behind) {
			let totalPopulation = game.players.length + game.dead.length + 1;
			for (let iwhile = 0; iwhile < totalPopulation; iwhile++) {
				if (player1.next != player2) {
					game.swapSeat(player1, player1.next, false, false);
				}
				else break;
			}
			if (prompt != false) {
				game.log(player1, '将座位移至', player2, '后');
			}
		}
		else {
			game.addVideo('swapSeat', null, [player1.dataset.position, player2.dataset.position]);
			let seat1 = player1.seatNum;
			let seat2 = player2.seatNum;
			player2.seatNum = seat1;
			player1.seatNum = seat2;
			let temp1, pos, i, num;
			temp1 = player1.dataset.position;
			player1.dataset.position = player2.dataset.position;
			player2.dataset.position = temp1;
			game.arrangePlayers();
			if (!game.chess) {
				if (player1.dataset.position == '0' || player2.dataset.position == '0') {
					pos = parseInt(player1.dataset.position);
					if (pos == 0) pos = parseInt(player2.dataset.position);
					num = game.players.length + game.dead.length;
					for (i = 0; i < game.players.length; i++) {
						temp1 = parseInt(game.players[i].dataset.position) - pos;
						if (temp1 < 0) temp1 += num;
						game.players[i].dataset.position = temp1;
					}
					for (i = 0; i < game.dead.length; i++) {
						temp1 = parseInt(game.dead[i].dataset.position) - pos;
						if (temp1 < 0) temp1 += num;
						game.dead[i].dataset.position = temp1;
					}
				}
			}
			if (prompt != false) {
				game.log(player1, '和', player2, '交换了座位');
			}
		}
		if (noanimate) {
			setTimeout(() => {
				player1.style.transition = '';
				player2.style.transition = '';
			}, 200);
		}
	}
	/**
	 * @param { Player } player1 
	 * @param { Player } [player2] 
	 */
	static swapPlayer(player, player2) {
		let players = game.players.concat(game.dead)
		if (player2) {
			if (player == game.me) game.swapPlayer(player2);
			else if (player2 == game.me) game.swapPlayer(player);
		}
		else {
			if (player == game.me) return;
			for (let i = 0; i < players.length; i++) {
				players[i].style.transition = 'all 0s';
			}
			game.addVideo('swapPlayer', player, get.cardsInfo(player.getCards('h')));
			if (!game.chess) {
				let pos = parseInt(player.dataset.position);
				let num = game.players.length + game.dead.length;
				let players = game.players.concat(game.dead);
				let temp;
				for (let i = 0; i < players.length; i++) {
					temp = parseInt(players[i].dataset.position) - pos;
					if (temp < 0) temp += num;
					players[i].dataset.position = temp;
				}
			}
			game.me.node.handcards1.remove();
			game.me.node.handcards2.remove();
			let current = game.me;
			game.me = player;
			if (current.isDead()) {
				current.$die();
			}
			ui.handcards1 = player.node.handcards1.addTempClass('start').fix();
			ui.handcards2 = player.node.handcards2.addTempClass('start').fix();
			ui.handcards1Container.appendChild(ui.handcards1);
			ui.handcards2Container.appendChild(ui.handcards2);

			ui.updatehl();
		}
		if (game.me.isAlive()) {
			if (ui.auto) ui.auto.show();
			if (ui.wuxie) ui.wuxie.show();
			if (ui.revive) {
				ui.revive.close();
				delete ui.revive;
			}
			if (ui.swap) {
				ui.swap.close();
				delete ui.swap;
			}
			if (ui.restart) {
				ui.restart.close();
				delete ui.restart;
			}
			if (ui.continue_game) {
				ui.continue_game.close();
				delete ui.continue_game;
			}
		}
		if (lib.config.mode == 'identity') {
			game.me.setIdentity(game.me.identity);
		}
		setTimeout((players) => {
			for (let i = 0; i < players.length; i++) {
				players[i].style.transition = '';
			}
		}, 100, players);
	}
	/**
	 * @param { Player } player
	 */
	static swapControl(player) {
		if (player == game.me) return;

		game.me.node.handcards1.remove();
		game.me.node.handcards2.remove();

		game.me = player;
		ui.handcards1 = player.node.handcards1.addTempClass('start').fix();
		ui.handcards2 = player.node.handcards2.addTempClass('start').fix();
		ui.handcards1Container.insertBefore(ui.handcards1, ui.handcards1Container.firstChild);
		ui.handcards2Container.insertBefore(ui.handcards2, ui.handcards2Container.firstChild);
		ui.updatehl();
		game.addVideo('swapControl', player, get.cardsInfo(player.getCards('h')));

		if (game.me.isAlive()) {
			if (ui.auto) ui.auto.show();
			if (ui.wuxie) ui.wuxie.show();
			if (ui.revive) {
				ui.revive.close();
				delete ui.revive;
			}
			if (ui.swap) {
				ui.swap.close();
				delete ui.swap;
			}
			if (ui.restart) {
				ui.restart.close();
				delete ui.restart;
			}
			if (ui.continue_game) {
				ui.continue_game.close();
				delete ui.continue_game;
			}
		}
	}
	static swapPlayerAuto(player) {
		if (game.modeSwapPlayer) {
			game.modeSwapPlayer(player);
		}
		else {
			game.swapPlayer(player);
		}
	}
	/**
	 * @param { Player } player
	 */
	static findNext(player) {
		let players = get.players(lib.sort.position);
		let position = parseInt(player.dataset.position);
		for (let i = 0; i < players.length; i++) {
			if (parseInt(players[i].dataset.position) >= position) {
				return players[i];
			}
		}
		return players[0];
	}
	/**
	 * @param { string } name 
	 * @param { Function } callback 
	 */
	static loadModeAsync(name, callback) {
		window.game = game;
		let script = lib.init.js(lib.assetURL + 'mode', name, async () => {
			await Promise.allSettled(_status.importing.mode);
			if (!lib.config.dev) delete window.game;
			script.remove();
			let content = lib.imported.mode[name];
			delete lib.imported.mode[name];
			if (get.is.empty(lib.imported.mode)) {
				delete lib.imported.mode;
			}
			callback(content);
		});
	}
	/**
	 * @param { string } name 
	 * @param {*} configx 
	 */
	static switchMode(name, configx) {
		if (!lib.layoutfixed.includes(name)) {
			if (lib.config.layout != game.layout) {
				lib.init.layout(lib.config.layout);
			}
			else if (lib.config.mode == 'brawl') {
				if (lib.config.player_border == 'normal' && (game.layout == 'long' || game.layout == 'long2')) {
					ui.arena.classList.add('lslim_player');
				}
			}
		}
		window.game = game;
		let script = lib.init.js(lib.assetURL + 'mode', name, async () => {
			await Promise.allSettled(_status.importing.mode);
			if (!lib.config.dev) delete window.game;
			script.remove();
			let mode = lib.imported.mode;
			_status.sourcemode = lib.config.mode;
			lib.config.mode = name;

			let i, j, k;
			for (i in mode[lib.config.mode].element) {
				if (!lib.element[i]) lib.element[i] = [];
				for (j in mode[lib.config.mode].element[i]) {
					if (j == 'init') {
						if (!lib.element[i].inits) lib.element[i].inits = [];
						lib.element[i].inits.push(mode[lib.config.mode].element[i][j]);
					}
					else {
						lib.element[i][j] = mode[lib.config.mode].element[i][j];
					}
				}
			}
			for (i in mode[lib.config.mode].ai) {
				if (typeof mode[lib.config.mode].ai[i] == 'object') {
					if (ai[i] == undefined) ai[i] = {};
					for (j in mode[lib.config.mode].ai[i]) {
						ai[i][j] = mode[lib.config.mode].ai[i][j];
					}
				}
				else {
					ai[i] = mode[lib.config.mode].ai[i];
				}
			}
			for (i in mode[lib.config.mode].ui) {
				if (typeof mode[lib.config.mode].ui[i] == 'object') {
					if (ui[i] == undefined) ui[i] = {};
					for (j in mode[lib.config.mode].ui[i]) {
						ui[i][j] = mode[lib.config.mode].ui[i][j];
					}
				}
				else {
					ui[i] = mode[lib.config.mode].ui[i];
				}
			}
			for (i in mode[lib.config.mode].game) {
				game[i] = mode[lib.config.mode].game[i];
			}
			for (i in mode[lib.config.mode].get) {
				get[i] = mode[lib.config.mode].get[i];
			}
			if (game.onwash) {
				lib.onwash.push(game.onwash);
				delete game.onwash;
			}
			if (game.onover) {
				lib.onover.push(game.onover);
				delete game.onover;
			}
			lib.config.banned = lib.config[lib.config.mode + '_banned'] || [];
			lib.config.bannedcards = lib.config[lib.config.mode + '_bannedcards'] || [];

			for (i in mode[lib.config.mode]) {
				if (i == 'element') continue;
				if (i == 'game') continue;
				if (i == 'ai') continue;
				if (i == 'ui') continue;
				if (i == 'get') continue;
				if (i == 'config') continue;
				if (i == 'start') continue;
				if (i == 'startBefore') continue;
				if (lib[i] == undefined) lib[i] = (Array.isArray(mode[lib.config.mode][i])) ? [] : {};
				for (j in mode[lib.config.mode][i]) {
					lib[i][j] = mode[lib.config.mode][i][j];
				}
			}

			// var pilecfg=lib.config.customcardpile[get.config('cardpilename')];
			// if(pilecfg){
			//     lib.config.bannedpile=pilecfg[0]||{};
			//     lib.config.addedpile=pilecfg[1]||{};
			// }

			_status.event = lib.element.GameEvent.initialGameEvent();
			_status.paused = false;

			if (_status.connectMode && lib.mode[name].connect) {
				game.saveConfig('connect_mode', name);
				game.clearConnect();
				lib.configOL.mode = name;
				if (configx) {
					for (let i in configx) {
						lib.configOL[i] = configx[i];
					}
				}
				else {
					for (let i in lib.mode[name].connect) {
						if (i == 'update') continue;
						lib.configOL[i.slice(8)] = get.config(i);
					}
					lib.configOL.zhinang_tricks = lib.config.connect_zhinang_tricks;
					lib.configOL.characterPack = lib.connectCharacterPack.slice(0);
					lib.configOL.cardPack = lib.connectCardPack.slice(0);
					for (let i = 0; i < lib.config.connect_characters.length; i++) {
						lib.configOL.characterPack.remove(lib.config.connect_characters[i]);
					}
					for (let i = 0; i < lib.config.connect_cards.length; i++) {
						lib.configOL.cardPack.remove(lib.config.connect_cards[i]);
					}
					lib.configOL.banned = lib.config['connect_' + name + '_banned'];
					lib.configOL.bannedcards = lib.config['connect_' + name + '_bannedcards'];
				}
				lib.configOL.version = lib.versionOL;
				for (let i in lib.cardPackList) {
					if (lib.configOL.cardPack.includes(i)) {
						lib.card.list = lib.card.list.concat(lib.cardPackList[i]);
					}
				}
				for (i = 0; i < lib.card.list.length; i++) {
					if (lib.card.list[i][2] == 'huosha') {
						lib.card.list[i] = lib.card.list[i].slice(0);
						lib.card.list[i][2] = 'sha';
						lib.card.list[i][3] = 'fire';
					}
					else if (lib.card.list[i][2] == 'leisha') {
						lib.card.list[i] = lib.card.list[i].slice(0);
						lib.card.list[i][2] = 'sha';
						lib.card.list[i][3] = 'thunder';
					}
					if (!lib.card[lib.card.list[i][2]]) {
						lib.card.list.splice(i, 1); i--;
					}
					else if (lib.card[lib.card.list[i][2]].mode &&
						lib.card[lib.card.list[i][2]].mode.includes(lib.config.mode) == false) {
						lib.card.list.splice(i, 1); i--;
					}
				}
			}

			if (!lib.config.show_playerids || !game.showIdentity) {
				ui.playerids.style.display = 'none';
			}
			else {
				ui.playerids.style.display = '';
			}

			if (mode[lib.config.mode].startBefore) mode[lib.config.mode].startBefore();
			game.createEvent('game', false).setContent(mode[lib.config.mode].start);
			if (lib.mode[lib.config.mode] && lib.mode[lib.config.mode].fromextension) {
				let startstr = mode[lib.config.mode].start.toString();
				if (startstr.indexOf('onfree') == -1) {
					setTimeout(lib.init.onfree, 500);
				}
			}
			delete lib.imported.mode[name];

			if (!lib.db) {
				try {
					lib.storage = JSON.parse(localStorage.getItem(lib.configprefix + lib.config.mode));
					if (typeof lib.storage != 'object') throw ('err');
					if (lib.storage == null) throw ('err');
				}
				catch (err) {
					lib.storage = {};
					localStorage.setItem(lib.configprefix + lib.config.mode, "{}");
				}
				game.loop();
			}
			else {
				game.getDB('data', lib.config.mode, function (obj) {
					lib.storage = obj || {};
					game.loop();
				});
			}
		});
	}
	/**
	 * @param { string } mode 
	 */
	static loadMode(mode) {
		let next = game.createEvent('loadMode', false);
		next.mode = mode;
		next.setContent('loadMode');
	}
	/**
	 * @param  {...string} args 
	 */
	static loadPackage(...args) {
		let next = game.createEvent('loadPackage');
		next.packages = [];
		for (let i = 0; i < arguments.length; i++) {
			if (typeof arguments[i] == 'string') {
				next.packages.push(arguments[i]);
			}
		}
		next.setContent('loadPackage');
	}
	/**
	 * @param { Player } player 
	 */
	static phaseLoop(player) {
		let next = game.createEvent('phaseLoop');
		next.player = player;
		next._isStandardLoop = true;
		next.setContent('phaseLoop');
	}
	/**
	 * @param { Player } [player] 
	 */
	static gameDraw(player, num = 4) {
		let next = game.createEvent('gameDraw');
		next.player = player || game.me;
		next.num = num;
		next.setContent('gameDraw');
		return next;
	}
	static chooseCharacterDouble() {
		let next = game.createEvent('chooseCharacter');
		let config, width, num, ratio, func, update, list, first;
		for (let i = 0; i < arguments.length; i++) {
			if (typeof arguments[i] == 'number') {
				if (!width) {
					width = arguments[i];
				}
				else if (!num) {
					num = arguments[i];
				}
				else {
					ratio = arguments[i];
				}
			}
			else if (typeof arguments[i] == 'function') {
				if (!func) {
					func = arguments[i];
				}
				else {
					update = arguments[i];
				}
			}
			else if (Array.isArray(arguments[i])) {
				list = arguments[i];
			}
			else if (get.objtype(arguments[i]) == 'object') {
				config = arguments[i];
			}
		}
		if (!config) {
			list = config;
			config = {};
		}
		config.width = config.width || width || 8;
		config.height = 4;
		config.size = config.width * config.height;
		config.num = config.num || num || 3;
		config.ratio = config.ratio || ratio || 1.2;
		config.update = config.update || update;
		if (!('first' in config)) {
			if (typeof first == 'boolean') {
				config.first = first;
			}
			else {
				config.first = 'rand';
			}
		}
		if (!list) {
			list = [];
			for (let i in lib.character) {
				if (typeof func == 'function') {
					if (!func(i)) continue;
				}
				else {
					if (lib.filter.characterDisabled(i)) continue;
				}
				list.push(i);
			}
		}
		next.config = config;
		next.list = list;
		next.setContent(function () {
			'step 0'
			event.nodes = [];
			event.avatars = [];
			event.friend = [];
			event.enemy = [];
			event.blank = [];
			for (let i = 0; i < event.config.size; i++) {
				event.nodes.push(ui.create.div('.shadowed.reduce_radius.choosedouble'));
			}
			event.moveAvatar = function (node, i) {
				if (!node.classList.contains('moved')) {
					event.blank.push(node.index);
				}
				event.nodes[node.index].style.display = '';
				event.nodes[node.index].show();
				clearTimeout(event.nodes[node.index].choosetimeout);
				event.moveNode(node, i);
				let nodex = event.nodes[node.index];
				nodex.choosetimeout = setTimeout(function () {
					nodex.hide();
					nodex.choosetimeout = setTimeout(function () {
						nodex.show();
						nodex.style.display = 'none';
					}, 300);
				}, 400);
			};
			event.aiMove = function (friend) {
				let list = [];
				for (let i = 0; i < event.avatars.length; i++) {
					if (!event.avatars[i].classList.contains('moved')) {
						list.push(event.avatars[i]);
					}
				}
				for (let i = 0; i < list.length; i++) {
					if (Math.random() < 0.7 || i == list.length - 1) {
						if (friend) {
							event.moveAvatar(list[i], event.friend.length + event.config.width * (event.config.height - 1));
							event.friend.push(list[i]);
						}
						else {
							event.moveAvatar(list[i], event.enemy.length);
							event.enemy.push(list[i]);
						}
						list[i].classList.add('moved');
						break;
					}
				}
			};
			event.promptbar = ui.create.div('.hidden', ui.window);
			event.promptbar.style.width = '100%';
			event.promptbar.style.left = 0;
			if (get.is.phoneLayout()) {
				event.promptbar.style.top = '20px';
			}
			else {
				event.promptbar.style.top = '58px';
			}
			event.promptbar.style.pointerEvents = 'none';
			event.promptbar.style.textAlign = 'center';
			event.promptbar.style.zIndex = '2';
			ui.create.div('.shadowed.reduce_radius', event.promptbar);
			event.promptbar.firstChild.style.fontSize = '18px';
			event.promptbar.firstChild.style.padding = '6px 10px';
			event.promptbar.firstChild.style.position = 'relative';
			event.prompt = function (str) {
				event.promptbar.firstChild.innerHTML = str;
				event.promptbar.show();
			};
			event.moveNode = function (node, i) {
				let width = event.width, height = event.height, margin = event.margin;
				let left = -(width + 10) * event.config.width / 2 + 5 + (i % event.config.width) * (width + 10);
				let top = -(height + 10) * event.config.height / 2 + 5 + Math.floor(i / event.config.width) * (height + 10) + margin / 2;
				node.style.transform = 'translate(' + left + 'px,' + top + 'px)';
				node.index = i;
			};
			event.resize = function () {
				let margin = 0;
				if (!get.is.phoneLayout()) {
					margin = 38;
				}
				let height = (ui.window.offsetHeight - 10 * (event.config.height + 1) - margin) / event.config.height;
				let width = (ui.window.offsetWidth - 10 * (event.config.width + 1)) / event.config.width;
				if (width * event.config.ratio < height) {
					height = width * event.config.ratio;
				}
				else {
					width = height / event.config.ratio;
				}
				event.width = width;
				event.height = height;
				event.margin = margin;
				for (let i = 0; i < event.config.size; i++) {
					event.moveNode(event.nodes[i], i);
					event.nodes[i].style.width = width + 'px';
					event.nodes[i].style.height = height + 'px';
					if (event.avatars[i]) {
						event.moveNode(event.avatars[i], event.avatars[i].index);
						event.avatars[i].style.width = width + 'px';
						event.avatars[i].style.height = height + 'px';
						event.avatars[i].nodename.style.fontSize = Math.max(14, Math.round(width / 5.6)) + 'px';
					}
				}
				if (event.deciding) {
					let str = 'px,' + (event.margin / 2 - event.height * 0.5) + 'px)';
					for (let i = 0; i < event.friendlist.length; i++) {
						event.friendlist[i].style.transform = 'scale(1.2) translate(' + (-(event.width + 14) * event.friendlist.length / 2 + 7 + i * (event.width + 14)) + str;
					}
				}
			};
			lib.onresize.push(event.resize);
			event.clickAvatar = function () {
				if (event.deciding) {
					if (this.index < event.config.width) return;
					if (event.friendlist.includes(this)) {
						event.friendlist.remove(this);
						event.moveNode(this, this.index);
						this.nodename.innerHTML = get.slimName(this.link);
					}
					else {
						event.friendlist.push(this);
					}
					if (event.friendlist.length == event.config.num) {
						event.deciding = false;
						event.prompt('比赛即将开始');
						setTimeout(game.resume, 1000);
					}
					if (event.config.update) {
						for (let i = 0; i < event.friendlist.length; i++) {
							event.friendlist[i].nodename.innerHTML = event.config.update(i, event.friendlist.length) || event.friendlist[i].nodename.innerHTML;
						}
					}
					let str = 'px,' + (event.margin / 2 - event.height * 0.5) + 'px)';
					for (let i = 0; i < event.friendlist.length; i++) {
						event.friendlist[i].style.transform = 'scale(1.2) translate(' + (-(event.width + 14) * event.friendlist.length / 2 + 7 + i * (event.width + 14)) + str;
					}
				}
				else {
					if (!event.imchoosing) return;
					if (event.replacing) {
						this.link = event.replacing;
						this.setBackground(event.replacing, 'character');

						this.nodename.innerHTML = get.slimName(event.replacing);
						this.nodename.dataset.nature = get.groupnature(lib.character[event.replacing][1]);

						delete event.replacing;
						if (this.classList.contains('moved')) {
							event.custom.add.window();
						}
					}
					if (this.classList.contains('moved')) return;
					event.moveAvatar(this, event.friend.length + event.config.width * (event.config.height - 1));
					event.friend.push(this.link);
					this.classList.add('moved');
					game.resume();
				}
			};
			event.skipnode = ui.create.system('跳过', function () {
				this.remove();
				event._skiprest = true;
				if (event.imchoosing) {
					game.resume();
				}
			});
			if (get.config('change_choice')) {
				event.replacenode = ui.create.system('换将', function () {
					event.promptbar.hide();
					while (event.avatars.length) {
						event.avatars.shift().remove();
					}
					for (let i = 0; i < event.config.size; i++) {
						event.nodes[i].show();
						event.nodes[i].style.display = '';
						clearTimeout(event.nodes[i].choosetimeout);
					}
					delete event.list2;
					event.friend.length = 0;
					event.enemy.length = 0;
					event.blank.length = 0;
					event.redoing = true;
					if (event.imchoosing) {
						game.resume();
					}
				}, true);
			}
			if (get.config('change_choice')) {
				event.reselectnode = ui.create.system('重选', function () {
					event.promptbar.hide();
					event.list2 = event.list2.concat(event.friend).concat(event.enemy);
					event.friend.length = 0;
					event.enemy.length = 0;
					for (let i = 0; i < event.avatars.length; i++) {
						if (event.avatars[i].classList.contains('moved')) {
							event.moveAvatar(event.avatars[i], event.blank.randomRemove());
							event.avatars[i].classList.remove('moved');
						}
					}
					event.redoing = true;
					if (event.imchoosing) {
						game.resume();
					}
				}, true);
			}
			if (get.config('free_choose')) {
				let createCharacterDialog = function () {
					event.freechoosedialog = ui.create.characterDialog();
					event.freechoosedialog.style.height = '80%';
					event.freechoosedialog.style.top = '10%';
					event.freechoosedialog.style.transform = 'scale(0.8)';
					event.freechoosedialog.style.transition = 'all 0.3s';
					event.freechoosedialog.listen(function (e) {
						if (!event.replacing) {
							event.dialoglayer.clicked = true;
						}
					});
					event.freechoosedialog.classList.add('pointerdialog');
					event.dialoglayer = ui.create.div('.popup-container.hidden', function (e) {
						if (this.classList.contains('removing')) return;
						if (this.clicked) {
							this.clicked = false;
							return;
						}
						ui.window.classList.remove('modepaused');
						this.delete();
						e.stopPropagation();
						event.freechoosedialog.style.transform = 'scale(0.8)';
						if (event.replacing) {
							event.prompt('用' + get.translation(event.replacing) + '替换一名武将');
						}
						else {
							if (event.side == 0) {
								event.prompt('请选择两名武将');
							}
							else {
								event.prompt('请选择一名武将');
							}
						}
					});
					event.dialoglayer.classList.add('modenopause');
					event.dialoglayer.appendChild(event.freechoosedialog);
					event.freechoosenode.classList.remove('hidden');
				}

				event.custom.replace.button = function (button) {
					event.replacing = button.link;
				};
				event.custom.add.window = function () {
					if (event.replacing) {
						delete event.replacing;
						if (event.side == 0) {
							event.prompt('请选择两名武将');
						}
						else {
							event.prompt('请选择一名武将');
						}
					}
				};
				event.freechoosenode = ui.create.system('自由选将', function () {
					if (this.classList.contains('hidden')) return;
					if (!event.imchoosing) {
						event.prompt('请等待敌方选将');
						return;
					}
					delete event.replacing;
					ui.window.classList.add('modepaused');
					ui.window.appendChild(event.dialoglayer);
					ui.refresh(event.dialoglayer);
					event.dialoglayer.show();
					event.freechoosedialog.style.transform = 'scale(1)';
					event.promptbar.hide();
				}, true);
				if (lib.onfree) {
					event.freechoosenode.classList.add('hidden');
					lib.onfree.push(createCharacterDialog);
				}
				else {
					createCharacterDialog();
				}
			}
			event.checkredo = function () {
				if (event.redoing) {
					event.goto(1);
					delete event.redoing;
					return true;
				}
			};
			// if(ui.cardPileButton) ui.cardPileButton.style.display='none';
			ui.auto.hide();
			ui.wuxie.hide();
			event.resize();
			for (let i = 0; i < event.config.size; i++) {
				ui.window.appendChild(event.nodes[i]);
			}
			'step 1'
			let rand1 = event.config.first;
			if (rand1 == 'rand') {
				rand1 = (Math.random() < 0.5);
			}
			if (rand1) {
				_status.color = true;
				event.side = 1;
			}
			else {
				_status.color = false;
				event.side = 3;
			}
			if (!event.list2) {
				event.list2 = event.list.randomGets(event.config.width * 2);
				for (let i = 0; i < event.config.width * 2; i++) {
					event.avatars.push(ui.create.div('.shadowed.shadowed2.reduce_radius.character.choosedouble', event.clickAvatar));
					let name = event.list2[i];
					event.avatars[i].setBackground(name, 'character');
					event.avatars[i].link = name;
					event.avatars[i].nodename = ui.create.div('.name', event.avatars[i], get.slimName(name));
					event.avatars[i].nodename.style.fontFamily = lib.config.name_font;
					event.avatars[i].index = i + event.config.width;
					event.avatars[i].addTempClass('start');
					event.nodes[event.avatars[i].index].style.display = 'none';
					event.avatars[i].nodename.dataset.nature = get.groupnature(lib.character[name][1]);
					lib.setIntro(event.avatars[i]);
				}
				event.resize();
				for (let i = 0; i < event.avatars.length; i++) {
					ui.window.appendChild(event.avatars[i]);
				}
				event.avatars.sort(function (a, b) {
					return get.rank(b.link, true) - get.rank(a.link, true);
				})
			}
			game.delay();
			lib.init.onfree();
			'step 2'
			if (event.checkredo()) return;
			if (event._skiprest) return;
			if (event.side < 2) {
				event.imchoosing = true;
				if (event.side == 0) {
					event.prompt('请选择两名武将');
				}
				else {
					event.prompt('请选择一名武将');
					event.fast = get.time();
				}
				game.pause();
			}
			else {
				event.aiMove();
				game.delay();
			}
			'step 3'
			if (typeof event.fast == 'number' && get.time() - event.fast <= 1000) {
				event.fast = true;
			}
			else {
				event.fast = false;
			}
			delete event.imchoosing;
			if (event.checkredo()) return;
			if (event._skiprest) {
				while (event.enemy.length < event.config.width) {
					event.aiMove();
				}
				while (event.friend.length < event.config.width) {
					event.aiMove(true);
				}
			}
			else if (event.friend.length + event.enemy.length < event.config.width * 2 - 1) {
				if (event.side == 1) {
					game.delay(event.fast ? 1 : 2);
					event.promptbar.hide();
				}
				event.side++;
				if (event.side > 3) {
					event.side = 0;
				}
				event.goto(2);
			}
			else {
				event.promptbar.hide();
				event.side++;
				if (event.side > 3) {
					event.side = 0;
				}
				if (event.side >= 2) {
					game.delay()
				}
			}
			'step 4'
			if (event.checkredo()) return;
			if (event.skipnode) event.skipnode.delete();
			if (event.replacenode) event.replacenode.delete();
			if (event.reselectnode) event.reselectnode.delete();
			if (event.freechoosenode) event.freechoosenode.delete();
			for (let i = 0; i < event.avatars.length; i++) {
				if (!event.avatars[i].classList.contains('moved')) {
					if (event.side < 2) {
						event.moveAvatar(event.avatars[i], event.friend.length + event.config.width * (event.config.height - 1));
						event.friend.push(event.avatars[i]);
					}
					else {
						event.moveAvatar(event.avatars[i], event.enemy.length);
						event.enemy.push(event.avatars[i]);
					}
					event.avatars[i].classList.add('moved');
				}
			}
			game.delay();
			'step 5'
			event.prompt('选择' + get.cnNumber(event.config.num) + '名出场武将');
			event.enemylist = [];
			for (let i = 0; i < event.avatars.length; i++) {
				if (event.avatars[i].index > event.config.width) {
					event.avatars[i].classList.add('selecting');
				}
			}
			let rand = [];
			for (let i = 0; i < event.config.width; i++) {
				for (let j = 0; j < event.config.width - i; j++) {
					rand.push(i);
				}
			}
			for (let i = 0; i < event.config.num; i++) {
				let rand2 = rand.randomGet();
				for (let j = 0; j < rand.length; j++) {
					if (rand[j] == rand2) {
						rand.splice(j--, 1);
					}
				}
				event.enemylist.push(event.enemy[rand2]);
			}
			event.enemylist.randomSort();
			event.friendlist = [];
			event.deciding = true;
			for (let i = 0; i < event.config.size; i++) {
				event.nodes[i].hide();
			}
			game.pause();
			'step 6'
			event.promptbar.delete();
			if (ui.cardPileButton) ui.cardPileButton.style.display = '';
			lib.onresize.remove(event.resize);
			ui.wuxie.show();
			ui.auto.show();
			for (let i = 0; i < event.avatars.length; i++) {
				event.avatars[i].delete();
			}
			for (let i = 0; i < event.nodes.length; i++) {
				event.nodes[i].delete();
			}
			event.result = { friend: [], enemy: [] };
			for (let i = 0; i < event.config.num; i++) {
				event.result.friend[i] = event.friendlist[i].link;
				event.result.enemy[i] = event.enemylist[i].link;
			}
		});
	}
	static updateRoundNumber() {
		game.broadcastAll((roundNumber, pileTop, pileNumber) => {
			if (game.roundNumber != roundNumber) game.roundNumber = roundNumber;
			if (_status.pileTop != pileTop) _status.pileTop = pileTop;
			ui.updateRoundNumber(roundNumber, pileNumber);
		}, game.roundNumber, ui.cardPile.firstChild, ui.cardPile.childElementCount);
	}
	/**
	 * @param { Player[] } players 
	 * @param { number | number[] | (player: Player) => number } num 
	 * @param { { drawDeck: boolean } } [drawDeck] 
	 * @param { boolean } [bottom] 
	 */
	static asyncDraw(players, num, drawDeck, bottom) {
		return players.forEach((value, index) => {
			let num2 = 1;
			if (typeof num == 'number') num2 = num;
			else if (Array.isArray(num)) num2 = num[index];
			else if (typeof num == 'function') num2 = num(value);
			if (drawDeck && drawDeck.drawDeck) value.draw(num2, false, drawDeck);
			else if (bottom) value.draw(num2, 'nodelay', 'bottom');
			else value.draw(num2, 'nodelay');
		})
	}
	/**
	 * @param { Player[] } players 
	 * @param { number | number[] | (player: Player) => number } num 
	 * @param { { drawDeck: boolean } } [drawDeck]
	 */
	static asyncDrawAuto(players, num, drawDeck) {
		if (players.length > 1) {
			game.asyncDraw.apply(this, arguments);
			return;
		}
		let num2 = 1;
		if (typeof num == 'number') num2 = num;
		else if (Array.isArray(num)) num2 = num[0];
		else if (typeof num == 'function') num2 = num(players[0]);
		if (drawDeck && drawDeck.drawDeck) players[0].draw(num2, drawDeck);
		else players[0].draw(num2);
	}
	static finishSkill(i, sub) {
		const mode = get.mode(), info = lib.skill[i], iInfo = `${i}_info`;
		if (info.alter) {
			lib.translate[`${iInfo}_origin`] = lib.translate[iInfo];
			if (!lib.config.vintageSkills.includes(i)) lib.translate[iInfo] = lib.translate[`${iInfo}_alter`];
		}
		else if (_status.mode && lib.translate[iInfo + '_' + mode + '_' + _status.mode]) lib.translate[iInfo] = lib.translate[iInfo + '_' + mode + '_' + _status.mode];
		else if (lib.translate[`${iInfo}_${mode}`]) lib.translate[iInfo] = lib.translate[`${iInfo}_${mode}`];
		else if (lib.translate[`${iInfo}_zhu`] && (mode == 'identity' || mode == 'guozhan' && _status.mode == 'four')) lib.translate[iInfo] = lib.translate[`${iInfo}_zhu`];
		else if (lib.translate[`${iInfo}_combat`] && get.is.versus()) lib.translate[iInfo] = lib.translate[`${iInfo}_combat`];
		let deleteSkill = function (skill, iInfo) {
			let skillx = {}, info = get.info(skill);
			if (info) {
				['audio', 'audioname', 'audioname2'].forEach(name => {
					if (info[name]) skillx[name] = info[name];
				});
			}
			lib.skill[skill] = skillx;
			if (lib.translate[iInfo]) lib.translate[iInfo] = '此模式下不可用';
			if (lib.dynamicTranslate[skill]) lib.dynamicTranslate[skill] = () => '此模式下不可用';
		};
		if ((info.forbid && info.forbid.includes(mode)) || (info.mode && info.mode.includes(mode) == false) || (info.available && info.available(mode) == false)) {
			deleteSkill(i, iInfo);
			return;
		}
		if (info.viewAs && typeof info.viewAs != 'function') {
			if (typeof info.viewAs == 'string') info.viewAs = {
				name: info.viewAs
			};
			if (!lib.card[info.viewAs.name]) {
				deleteSkill(i, iInfo);
				return;
			}
			if (info.ai == undefined) info.ai = {};
			const skill = info.ai, card = lib.card[info.viewAs.name].ai;
			if (card) Object.keys(card).forEach(value => {
				if (skill[value] == undefined) skill[value] = card[value];
				else if (typeof skill[value] == 'object') Object.keys(card[value]).forEach(element => {
					if (skill[value][element] == undefined) skill[value][element] = card[value][element];
				});
			});
		}
		if (info.inherit) {
			const skill = lib.skill[info.inherit];
			if (skill) Object.keys(skill).forEach(value => {
				if (info[value] != undefined) return;
				if (value == 'audio' && (typeof info[value] == 'number' || typeof info[value] == 'boolean')) info[value] = info.inherit;
				else info[value] = skill[value];
			});
			if (lib.translate[i] == undefined) lib.translate[i] = lib.translate[info.inherit];
			if (lib.translate[iInfo] == undefined) lib.translate[iInfo] = lib.translate[`${info.inherit}_info`];
		}
		if (info.limited) {
			if (info.mark === undefined) info.mark = true;
			if (!info.intro) info.intro = {};
			if (info.intro.content === undefined) info.intro.content = 'limited';
			if (info.skillAnimation === undefined) info.skillAnimation = true;
			if (info.init === undefined) info.init = (player, skill) => player.storage[skill] = false;
		}
		if (info.subSkill && !sub) Object.keys(info.subSkill).forEach(value => {
			const iValue = `${i}_${value}`;
			lib.skill[iValue] = info.subSkill[value];
			lib.skill[iValue].sub = true;
			if (info.subSkill[value].name) lib.translate[iValue] = info.subSkill[value].name;
			else lib.translate[iValue] = lib.translate[iValue] || lib.translate[i];
			if (info.subSkill[value].description) lib.translate[`${iValue}_info`] = info.subSkill[value].description;
			if (info.subSkill[value].marktext) lib.translate[`${iValue}_bg`] = info.subSkill[value].marktext;
			game.finishSkill(iValue, true);
		});
		if (info.round) {
			const k = `${i}_roundcount`;
			if (typeof info.group == 'string') info.group = [info.group, k];
			else if (Array.isArray(info.group)) info.group.add(k);
			else info.group = [k];
			lib.skill[k] = ((round, name) => ({
				init: player => {
					if (typeof player.storage[name] !== 'number') player.storage[name] = 1 - round;
				},
				intro: {
					content: (storage, player) => {
						let str = '';
						const info = get.info(name.slice(0, name.indexOf('_roundcount')));
						if (info && info.addintro) str += info.addintro(storage, player);
						const num = round - (game.roundNumber - storage);
						if (num > 0) str += `${get.cnNumber(num)}轮后${info.roundtext || '技能重置'}`;
						else str += '技能可发动';
						return str;
					},
					markcount: (storage, player) => Math.max(round - (game.roundNumber - storage), 0)
				},
				trigger: { global: 'roundStart' },
				forced: true,
				popup: false,
				silent: true,
				content: () => {
					if (lib.skill[event.name.slice(0, event.name.indexOf('_roundcount'))].round - (game.roundNumber - player.storage[event.name]) > 0) player.updateMarks();
					else player.unmarkSkill(event.name);
				}
			}))(info.round, k);
			lib.translate[k] = lib.translate[i] || '';
			lib.translate[`${k}_bg`] = lib.translate[`${i}_bg`] || lib.translate[k][0];
		}
		if (info.marktext) lib.translate[`${i}_bg`] = info.marktext;
		if (info.silent) {
			if (!('forced' in info)) info.forced = true;
			if (!('popup' in info)) info.popup = false;
		}
		if (!('_priority' in info)) {
			let priority = 0;
			if (info.priority) {
				priority = info.priority * 100;
			}
			if (info.silent) {
				priority++;
			}
			if (info.equipSkill) priority -= 25;
			if (info.cardSkill) priority -= 50;
			if (info.ruleSkill) priority -= 75;
			info._priority = priority;
		}
		if (i[0] == '_') game.addGlobalSkill(i);
	}
	static finishCards() {
		_status.cardsFinished = true;
		const mode = get.mode(), filterTarget = (card, player, target) => player == target && target.canEquip(card, true), aiBasicOrder = (card, player) => {
			const equipValue = get.equipValue(card, player) / 20;
			return player && player.hasSkillTag('reverseEquip') ? 8.5 - equipValue : 8 + equipValue;
		}, aiBasicValue = (card, player, index, method) => {
			if (!player.getCards('e').includes(card) && !player.canEquip(card, true)) return 0.01;
			const info = get.info(card), current = player.getEquip(info.subtype), value = current && card != current && get.value(current, player);
			let equipValue = info.ai.equipValue || info.ai.basic.equipValue;
			if (typeof equipValue == 'function') {
				if (method == 'raw') return equipValue(card, player);
				if (method == 'raw2') return equipValue(card, player) - value;
				return Math.max(0.1, equipValue(card, player) - value);
			}
			if (typeof equipValue != 'number') equipValue = 0;
			if (method == 'raw') return equipValue;
			if (method == 'raw2') return equipValue - value;
			return Math.max(0.1, equipValue - value);
		}, aiResultTarget = (player, target, card) => get.equipResult(player, target, card.name);
		Object.keys(lib.card).forEach(libCardKey => {
			const info = `${libCardKey}_info`;
			if (lib.translate[`${info}_${mode}`]) lib.translate[info] = lib.translate[`${info}_${mode}`];
			else if (lib.translate[`${info}_zhu`] && (mode == 'identity' || mode == 'guozhan' && _status.mode == 'four')) lib.translate[info] = lib.translate[`${info}_zhu`];
			else if (lib.translate[`${info}_combat`] && get.is.versus()) lib.translate[info] = lib.translate[`${info}_combat`];
			const card = lib.card[libCardKey];
			if (card.filterTarget && card.selectTarget == undefined) card.selectTarget = 1;
			if (card.autoViewAs) {
				if (!card.ai) card.ai = {};
				if (!card.ai.order) {
					card.ai.order = lib.card[card.autoViewAs].ai.order;
					if (!card.ai.order && lib.card[card.autoViewAs].ai.basic) card.ai.order = lib.card[card.autoViewAs].ai.basic.order;
				}
			}
			if (card.type == 'equip') {
				if (card.enable == undefined) card.enable = true;
				if (card.selectTarget == undefined) card.selectTarget = -1;
				if (card.filterTarget == undefined) card.filterTarget = filterTarget;
				if (card.modTarget == undefined) card.modTarget = true;
				if (card.allowMultiple == undefined) card.allowMultiple = false;
				if (card.content == undefined) card.content = lib.element.content.equipCard;
				if (card.toself == undefined) card.toself = true;
				if (card.ai == undefined) card.ai = {
					basic: {}
				};
				if (card.ai.basic == undefined) card.ai.basic = {};
				if (card.ai.result == undefined) card.ai.result = {
					target: 1.5
				};
				if (card.ai.basic.order == undefined) card.ai.basic.order = aiBasicOrder;
				if (card.ai.basic.useful == undefined) card.ai.basic.useful = 2;
				if (card.subtype == 'equip3') {
					if (card.ai.basic.equipValue == undefined) card.ai.basic.equipValue = 7;
				}
				else if (card.subtype == 'equip4') {
					if (card.ai.basic.equipValue == undefined) card.ai.basic.equipValue = 4;
				}
				else if (card.ai.basic.equipValue == undefined) card.ai.basic.equipValue = 1;
				if (card.ai.basic.value == undefined) card.ai.basic.value = aiBasicValue;
				if (!card.ai.result.keepAI) card.ai.result.target = aiResultTarget;
			}
			else if (card.type == 'delay' || card.type == 'special_delay') {
				if (card.enable == undefined) card.enable = true;
				if (card.filterTarget == undefined) card.filterTarget = lib.filter.judge;
				if (card.content == undefined) card.content = lib.element.content.addJudgeCard;
				if (card.allowMultiple == undefined) card.allowMultiple = false;
			}
		});
		Object.keys(lib.skill).forEach(value => game.finishSkill(value));
	}
	/**
	 * 这玩意至少19种重载了吧
	 */
	static checkMod() {
		const argumentArray = Array.from(arguments), name = argumentArray[argumentArray.length - 2];
		let skills = argumentArray[argumentArray.length - 1];
		if (typeof skills.getModableSkills == 'function') {
			skills = skills.getModableSkills(_status.event.useCache === true);
		} else if (typeof skills.getSkills == 'function') {
			skills = skills.getSkills().concat(lib.skill.global);
			game.expandSkills(skills);
			skills = skills.filter(function (skill) {
				var info = get.info(skill);
				return info && info.mod;
			});
			skills.sort((a, b) => get.priority(a) - get.priority(b));
		}
		const arg = argumentArray.slice(0, -2);
		skills.forEach(value => {
			var mod = get.info(value).mod[name];
			if (!mod) return;
			const result = mod.apply(this, arg);
			if (typeof arg[arg.length - 1] != 'object' && result != undefined) arg[arg.length - 1] = result;
		});
		return arg[arg.length - 1];
	}
	/**
	 * @param { number } num 
	 */
	static prepareArena(num) {
		_status.prepareArena = true;
		game.showHistory(false);
		ui.create.players(num);
		ui.create.me();
		ui.create.cardsAsync();
		game.finishCards();
	}
	static clearArena() {
		ui.control.innerHTML = '';
		ui.arenalog.innerHTML = '';
		Array.from(ui.arena.childNodes).forEach(value => {
			if (value == ui.canvas) return;
			if (value == ui.control) return;
			if (value == ui.arenalog) return;
			if (value == ui.roundmenu) return;
			if (value == ui.timer) return;
			if (value == ui.autonode) return;
			value.remove();
		});
		ui.sidebar.innerHTML = '';
		ui.cardPile.innerHTML = '';
		ui.discardPile.innerHTML = '';
		ui.special.innerHTML = '';
		ui.ordering.innerHTML = '';
		ui.playerids.remove();
		game.players.length = 0;
		game.dead.length = 0;
		game.me = null;
	}
	static clearConnect() {
		if (ui.ipnode) {
			ui.ipnode.remove();
			delete ui.ipnode;
		}
		if (ui.iptext) {
			ui.iptext.remove();
			delete ui.iptext;
		}
		if (ui.ipbutton) {
			ui.ipbutton.remove();
			delete ui.ipbutton;
		}
		if (ui.recentIP) {
			ui.recentIP.remove();
			delete ui.recentIP;
		}
		if (ui.hall_button) {
			ui.hall_button.remove();
			delete ui.hall_button;
		}
		if (ui.startServer) {
			ui.startServer.remove();
			delete ui.startServer;
		}
		if (ui.rooms) {
			ui.rooms.forEach(value => value.remove());
			delete ui.rooms;
		}
		if (ui.roombase) {
			ui.roombase.remove();
			delete ui.roombase;
		}
		if (!ui.connectEvents) return;
		ui.connectEvents.remove();
		ui.connectEventsCount.remove();
		ui.connectClients.remove();
		ui.connectClientsCount.remove();
		ui.createRoomButton.remove();
		delete ui.connectEvents;
		delete ui.connectEventsCount;
		delete ui.connectClients;
		delete ui.connectClientsCount;
		delete ui.createRoomButton;
	}
	static log() {
		let str = '', str2 = '', logvid = null;
		const color = new Map([
			['r', 'fire'],
			['y', 'yellow'],
			['g', 'green'],
			['b', 'blue']
		]);
		Array.from(arguments).forEach(value => {
			const itemtype = get.itemtype(value);
			if (itemtype == 'player' || itemtype == 'players') {
				str += `<span class="bluetext">${get.translation(value)}</span>`;
				str2 += get.translation(value);
			}
			else if (itemtype == 'cards' || itemtype == 'card' || (typeof value == 'object' && value && value.name)) {
				str += `<span class="yellowtext">${get.translation(value)}</span>`;
				str2 += get.translation(value);
			}
			else if (typeof value == 'object') {
				if (value.parentNode == ui.historybar) logvid = value.logvid;
				else {
					str += get.translation(value);
					str2 += get.translation(value);
				}
			}
			else if (typeof value == 'string') {
				if (value[0] == '【' && value[value.length - 1] == '】') {
					str += `<span class="greentext">${get.translation(value)}</span>`;
					str2 += get.translation(value);
				}
				else if (value[0] == '#') {
					str += `<span class="${color.get(value[1]) || ''}text">${get.translation(value.slice(2))}</span>`;
					str2 += get.translation(value.slice(2));
				}
				else {
					str += get.translation(value);
					str2 += get.translation(value);
				}
			}
			else {
				str += value;
				str2 += value;
			}
		});
		const node = ui.create.div();
		node.innerHTML = lib.config.log_highlight ? str : str2;
		ui.sidebar.insertBefore(node, ui.sidebar.firstChild);
		game.addVideo('log', null, lib.config.log_highlight ? str : str2);
		game.broadcast((str, str2) => game.log(lib.config.log_highlight ? str : str2), str, str2);
		if (!_status.video && !game.online) {
			if (logvid) game.logv(logvid, `<div class="text center">${lib.config.log_highlight ? str : str2}</div>`);
			else logvid = _status.event.getLogv();
		}
		if (lib.config.show_log == 'off' || game.chess) return;
		const nodeentry = node.cloneNode(true);
		ui.arenalog.insertBefore(nodeentry, ui.arenalog.firstChild);
		if (!lib.config.clear_log) while (ui.arenalog.childNodes.length && ui.arenalog.scrollHeight > ui.arenalog.offsetHeight) {
			ui.arenalog.lastChild.remove();
		}
		if (!lib.config.low_performance) {
			nodeentry.style.transition = 'all 0s';
			nodeentry.style.marginBottom = `-${nodeentry.offsetHeight}px`;
			ui.refresh(nodeentry);
			nodeentry.style.transition = '';
			nodeentry.style.marginBottom = '';
		}
		if (!lib.config.clear_log) return;
		nodeentry.timeout = setTimeout(() => nodeentry.delete(), 1000);
		Array.from(ui.arenalog.childNodes).forEach(value => {
			if (!value.timeout) value.remove();
		});
	}
	/**
	 * @param { Player } player 
	 * @param { string | Card[] } card 
	 * @param { Player[] } [targets] 
	 * @param { GameEventPromise } [event] 
	 * @param { boolean } [forced] 
	 * @param { string } [logvid] 
	 */
	static logv(player, card, targets, event, forced, logvid) {
		if (!player) {
			player = _status.event.getParent().logvid;
			if (!player) return;
		}
		const node = ui.create.div('.hidden');
		node.node = {};
		logvid = logvid || get.id();
		game.broadcast(game.logv, player, card, targets, event, forced, logvid);
		if (typeof player == 'string') {
			const childNode = Array.from(ui.historybar.childNodes).find(value => value.logvid == player);
			if (childNode) childNode.added.push(card);
			return;
		}
		if (typeof card == 'string') {
			if (card != 'die') {
				if (lib.skill[card] && lib.skill[card].logv === false && !forced) return;
				if (!lib.translate[card]) return;
			}
			let avatar;
			if (!player.isUnseen(0)) avatar = player.node.avatar.cloneNode();
			else if (!player.isUnseen(1)) avatar = player.node.avatar2.cloneNode();
			else return;
			node.node.avatar = avatar;
			avatar.style.transform = '';
			avatar.className = 'avatar';
			if (card == 'die') {
				node.dead = true;
				node.player = player;
				const avatar2 = avatar.cloneNode();
				avatar2.className = 'avatarbg grayscale1';
				avatar.appendChild(avatar2);
				avatar.style.opacity = 0.6;
			}
			else {
				node.node.text = ui.create.div('', get.translation(card, 'skill'), avatar);
				node.node.text.dataset.nature = 'water';
				node.skill = card;
			}
			node.appendChild(avatar);
			if (card == 'die' && targets && targets != player) {
				node.source = targets;
				player = targets;
				if (!player.isUnseen(0)) avatar = player.node.avatar.cloneNode();
				else if (!player.isUnseen(1)) avatar = player.node.avatar2.cloneNode();
				else if (get.mode() == 'guozhan' && player.node && player.node.name_seat) {
					avatar = ui.create.div('.avatar.cardbg');
					avatar.innerHTML = player.node.name_seat.innerHTML[0];
				}
				else return;
				avatar.style.transform = '';
				node.node.avatar2 = avatar;
				avatar.classList.add('avatar2');
				node.appendChild(avatar);
			}
		}
		else if (Array.isArray(card)) {
			node.cards = card[1].slice(0)
			card = card[0];
			const info = [card.suit || '', card.number || '', card.name || '', card.nature || ''];
			if (!Array.isArray(node.cards) || !node.cards.length) node.cards = [ui.create.card(node, 'noclick', true).init(info)];
			if (card.name == 'wuxie') {
				if (ui.historybar.firstChild && ui.historybar.firstChild.type == 'wuxie') {
					ui.historybar.firstChild.players.push(player);
					ui.historybar.firstChild.cards.addArray(node.cards);
					return;
				}
				node.type = 'wuxie';
				node.players = [player];
			}
			if (card.copy) card.copy(node, false);
			else {
				card = ui.create.card(node, 'noclick', true);
				card.init(info);
			}
			let avatar;
			if (!player.isUnseen(0)) avatar = player.node.avatar.cloneNode();
			else if (!player.isUnseen(1)) avatar = player.node.avatar2.cloneNode();
			else if (get.mode() == 'guozhan' && player.node && player.node.name_seat) {
				avatar = ui.create.div('.avatar.cardbg');
				avatar.innerHTML = player.node.name_seat.innerHTML[0];
			}
			else return;
			node.node.avatar = avatar;
			avatar.style.transform = '';
			avatar.classList.add('avatar2');
			node.appendChild(avatar);
			if (targets && targets.length == 1 && targets[0] != player && get.itemtype(targets[0]) == 'player') (() => {
				let avatar2;
				const target = targets[0];
				if (!target.isUnseen(0)) avatar2 = target.node.avatar.cloneNode();
				else if (!player.isUnseen(1)) avatar2 = target.node.avatar2.cloneNode();
				else if (get.mode() == 'guozhan' && target.node && target.node.name_seat) {
					avatar2 = ui.create.div('.avatar.cardbg');
					avatar2.innerHTML = target.node.name_seat.innerHTML[0];
				}
				else return;
				node.node.avatar2 = avatar2;
				avatar2.style.transform = '';
				avatar2.classList.add('avatar2');
				avatar2.classList.add('avatar3');
				node.insertBefore(avatar2, avatar);
			})();
		}
		if (targets && targets.length) {
			if (targets.length == 1 && targets[0] == player) {
				node.targets = [];
			}
			else {
				node.targets = targets;
			}
		}
		const fullheight = ui.historybar.offsetHeight, num = Math.round((fullheight - 8) / 50), margin = (fullheight - 42 * num) / (num + 1);
		node.style.transform = 'scale(0.8)';
		ui.historybar.insertBefore(node, ui.historybar.firstChild);
		ui.refresh(node);
		node.classList.remove('hidden');
		Array.from(ui.historybar.childNodes).forEach((value, index) => {
			if (index < num) {
				value.style.transform = `scale(1) translateY(${margin + index * (42 + margin) - 4}px)`;
				return;
			}
			if (value.removetimeout) return;
			value.style.opacity = 0;
			value.style.transform = `scale(1) translateY(${fullheight}px)`;
			value.removetimeout = setTimeout((current => () => current.remove())(value), 500);
		});
		if (lib.config.touchscreen) node.addEventListener('touchstart', ui.click.intro);
		else {
			node.addEventListener(lib.config.pop_logv ? 'mousemove' : 'click', ui.click.logv);
			node.addEventListener('mouseleave', ui.click.logvleave);
		}
		node.logvid = logvid;
		node.added = [];
		if (!game.online) {
			event = event || _status.event;
			event.logvid = node.logvid;
		}
		return node;
	}
	/**
	 * @param { string } storeName 
	 * @param { string } idbValidKey 
	 * @param { any } value 
	 * @param { Function } [onSuccess] 
	 * @param { Function } [onError] 
	 */
	static putDB(storeName, idbValidKey, value, onSuccess, onError) {
		if (!lib.db) return Promise.resolve(value);
		if (lib.status.reload) return new Promise((resolve, reject) => lib[_status.dburgent ? 'ondb2' : 'ondb'].push(['putDB', [storeName, idbValidKey, value, event => {
			if (typeof onSuccess == 'function') onSuccess(event);
			resolve(event);
		}, event => {
			if (typeof onError == 'function') {
				onError(event);
				resolve();
			}
			else reject(event);
		}]]));
		lib.status.reload++;
		return new Promise((resolve, reject) => {
			const record = lib.db.transaction([storeName], 'readwrite').objectStore(storeName).put(value, idbValidKey);
			record.onerror = event => {
				if (typeof onError == 'function') {
					onError(event);
					game.reload2();
					resolve();
				}
				else {
					game.reload2();
					reject(event);
				}
			};
			record.onsuccess = event => {
				if (typeof onSuccess == 'function') {
					_status.dburgent = true;
					onSuccess(event);
					delete _status.dburgent;
				}
				game.reload2();
				resolve(event);
			};
		});
	}
	/**
	 * 
	 * @param { string } storeName 
	 * @param { string } [query] 
	 * @param { Function } [onSuccess] 
	 * @param { Function } [onError] 
	 */
	static getDB(storeName, query, onSuccess, onError) {
		if (!lib.db) return new Promise(resolve => {
			if (typeof onSuccess == 'function') onSuccess(null);
			resolve(null);
		});
		if (lib.status.reload) return new Promise((resolve, reject) => lib[_status.dburgent ? 'ondb2' : 'ondb'].push(['getDB', [storeName, query, result => {
			if (typeof onSuccess == 'function') onSuccess(result);
			resolve(result);
		}, event => {
			if (typeof onError == 'function') {
				onError(event);
				resolve();
			}
			else reject(event);
		}]]));
		return new Promise(query ? (resolve, reject) => {
			lib.status.reload++;
			const idbRequest = lib.db.transaction([storeName], 'readwrite').objectStore(storeName).get(query);
			idbRequest.onerror = event => {
				if (typeof onError == 'function') {
					onError(event);
					game.reload2();
					resolve();
				}
				else {
					game.reload2();
					reject(event);
				}
			};
			idbRequest.onsuccess = event => {
				const result = event.target.result;
				if (typeof onSuccess == 'function') {
					_status.dburgent = true;
					onSuccess(result);
					delete _status.dburgent;
				}
				game.reload2();
				resolve(result);
			};
		} : (resolve, reject) => {
			lib.status.reload++;
			const idbRequest = lib.db.transaction([storeName], 'readwrite').objectStore(storeName).openCursor(), object = {};
			idbRequest.onerror = event => {
				if (typeof onError == 'function') {
					onError(event);
					game.reload2();
					resolve();
				}
				else {
					game.reload2();
					reject(event);
				}
			};
			idbRequest.onsuccess = event => {
				const result = event.target.result;
				if (result) {
					object[result.key] = result.value;
					result.continue();
					return;
				}
				if (typeof onSuccess == 'function') {
					_status.dburgent = true;
					onSuccess(object);
					delete _status.dburgent;
				}
				game.reload2();
				resolve(object);
			};
		});
	}
	/**
	 * @param { string } storeName 
	 * @param { string } [query] 
	 * @param { Function } [onSuccess] 
	 * @param { Function } [onError] 
	 */
	static deleteDB(storeName, query, onSuccess, onError) {
		if (!lib.db) return new Promise(resolve => {
			if (typeof onSuccess == 'function') onSuccess(false);
			resolve(false);
		});
		if (lib.status.reload) return new Promise((resolve, reject) => lib[_status.dburgent ? 'ondb2' : 'ondb'].push(['deleteDB', [storeName, query, event => {
			if (typeof onSuccess == 'function') onSuccess(event);
			resolve(event);
		}, event => {
			if (typeof onError == 'function') {
				onError(event);
				resolve();
			}
			else reject(event);
		}]]));
		return query ? new Promise((resolve, reject) => {
			lib.status.reload++;
			const record = lib.db.transaction([storeName], 'readwrite').objectStore(storeName).delete(query);
			record.onerror = event => {
				if (typeof onError == 'function') {
					onError(event);
					game.reload2();
					resolve();
				}
				else {
					game.reload2();
					reject(event);
				}
			};
			record.onsuccess = event => {
				if (typeof onSuccess == 'function') onSuccess(event);
				game.reload2();
				resolve(event);
			};
		}) : game.getDB(storeName).then(object => {
			const keys = Object.keys(object);
			lib.status.reload += keys.length;
			const store = lib.db.transaction([storeName], 'readwrite').objectStore(storeName);
			return Promise.allSettled(keys.map(key => new Promise((resolve, reject) => {
				const request = store.delete(key);
				request.onerror = event => {
					game.reload2();
					reject(event);
				};
				request.onsuccess = event => {
					game.reload2();
					resolve(event);
				};
			})));
		});
	}
	/**
	 * @param { string } key 
	 * @param { * } [value] 
	 * @param { string } [mode] 
	 */
	static save(key, value, mode) {
		if (_status.reloading) return;
		mode = mode || lib.config.mode;
		if (lib.db) {
			if (!key) {
				game.putDB('data', mode, get.copy(lib.storage));
				return;
			}
			if (mode == lib.config.mode) {
				if (value == undefined) delete lib.storage[key];
				else lib.storage[key] = value;
				lib.storage.version = lib.version;
				game.putDB('data', mode, lib.storage);
			}
			else game.getDB('data', mode, config => {
				if (!config) config = {};
				if (value == undefined) delete config[key];
				else config[key] = value;
				config.version = lib.version;
				game.putDB('data', mode, config);
			});
			return;
		}
		if (!key) {
			localStorage.setItem(`${lib.configprefix}${mode}`, JSON.stringify(lib.storage));
			return;
		}
		let config;
		try {
			config = JSON.parse(localStorage.getItem(`${lib.configprefix}${mode}`));
			if (typeof config != 'object') throw 'err';
		}
		catch (err) {
			config = {};
		}
		if (value == undefined) {
			delete config[key];
			if (mode == lib.config.mode) delete lib.storage[key];
		}
		else {
			config[key] = value;
			if (mode == lib.config.mode) lib.storage[key] = value;
		}
		config.version = lib.version;
		localStorage.setItem(`${lib.configprefix}${mode}`, JSON.stringify(config));
	}
	static showChangeLog() {
		if (lib.version == lib.config.version && !_status.extensionChangeLog) return;
		const ul = document.createElement('ul');
		ul.style.textAlign = 'left';
		const caption = lib.version == lib.config.version ? '扩展更新' : `${lib.version}更新内容`;
		let players = null, cards = null;
		if (lib.version != lib.config.version) lib.changeLog.forEach(value => {
			if (value.startsWith('players://')) try {
				players = JSON.parse(value.slice(10)).filter(value => lib.character[value]);
			}
				catch (e) {
					players = null;
				}
			else if (value.startsWith('cards://')) try {
				cards = JSON.parse(value.slice(8)).filter(value => lib.card[value]);
			}
				catch (e) {
					cards = null;
				}
			else {
				const li = document.createElement('li');
				li.innerHTML = value;
				ul.appendChild(li);
			}
		});
		game.saveConfig('version', lib.version);
		if (_status.extensionChangeLog) Object.keys(_status.extensionChangeLog).forEach(value => {
			const li = document.createElement('li');
			li.innerHTML = `${value}：${_status.extensionChangeLog[value]}`;
			ul.appendChild(li);
		});
		const dialog = ui.create.dialog(caption, 'hidden'), lic = ui.create.div(dialog.content);
		lic.style.display = 'block';
		ul.style.display = 'inline-block';
		ul.style.marginLeft = '-40px';
		lic.appendChild(ul);
		if (players && players.length) {
			dialog.addSmall([players, 'character']);
			dialog.classList.add('forcebutton');
			dialog.classList.add('withbg');
		}
		if (cards && cards.length) {
			dialog.addSmall([cards.map(value => [get.translation(get.type(value)), '', value]), 'vcard']);
			dialog.classList.add('forcebutton');
			dialog.classList.add('withbg');
		}
		dialog.open();
		let hidden = false;
		if (!ui.auto.classList.contains('hidden')) {
			ui.auto.hide();
			hidden = true;
		}
		game.pause();
		const control = ui.create.control('确定', () => {
			dialog.close();
			control.close();
			if (hidden) ui.auto.show();
			game.resume();
		});
		lib.init.onfree();
	}
	/**
	 * @param { string } str 
	 * @param { string } [extname] 
	 */
	static showExtensionChangeLog(str, extname) {
		extname = extname || _status.extension;
		const cfg = `extension_${extname}_changelog`;
		if (!lib.extensionPack[extname] || lib.extensionPack[extname].version == lib.config[cfg]) return;
		game.saveConfig(cfg, lib.extensionPack[extname].version);
		if (_status.extensionChangeLog) return;
		_status.extensionChangeLog = {};
		_status.extensionChangeLog[extname] = str;
	}
	/**
	 * @param { string } key 
	 * @param { * } [value] 
	 * @param { string } [local] 
	 * @param { Function } [callback] 
	 */
	static saveConfig(key, value, local, callback) {
		if (_status.reloading) return;
		if (local) {
			const localmode = typeof local == 'string' ? local : lib.config.mode;
			if (!lib.config.mode_config[localmode]) lib.config.mode_config[localmode] = {};
			if (value == undefined) delete lib.config.mode_config[localmode][key];
			else lib.config.mode_config[localmode][key] = value;
			key += `_mode_config_${localmode}`;
		}
		else if (value == undefined) delete lib.config[key];
		else lib.config[key] = value;
		if (lib.db) {
			if (value == undefined) game.deleteDB('config', key, callback);
			else game.putDB('config', key, value, callback);
			return;
		}
		let config;
		try {
			config = JSON.parse(localStorage.getItem(`${lib.configprefix}config`));
			if (!config || typeof config != 'object') throw 'err';
		}
		catch (err) {
			config = {};
		}
		if (value === undefined) delete config[key];
		else config[key] = value;
		localStorage.setItem(`${lib.configprefix}config`, JSON.stringify(config));
		if (callback) callback();
	}
	/**
	 * @param { string } key 
	 */
	static saveConfigValue(key) { return game.saveConfig(key, lib.config[key]) }
	/**
	 * @param { string } extension 
	 * @param { string } key 
	 * @param { * } [value]
	 */
	static saveExtensionConfig(extension, key, value) { return game.saveConfig(`extension_${extension}_${key}`, value) }
	/**
	 * @param { string } extension 
	 * @param { string } key 
	 */
	static saveExtensionConfigValue(extension, key) { return game.saveExtensionConfig(extension, key, game.getExtensionConfig(extension, key)) }
	/**
	 * @param { string } extension 
	 * @param { string } key 
	 */
	static getExtensionConfig(extension, key) { return lib.config[`extension_${extension}_${key}`] }
	/**
	 * @param { string } mode 
	 */
	static clearModeConfig(mode) {
		if (_status.reloading) return;
		if (lib.db) {
			game.getDB('config', null, config => Object.keys(config).forEach(value => {
				if (value.substr(value.indexOf('_mode_config') + 13) == mode) game.saveConfig(value);
			}));
			return;
		}
		let config;
		try {
			config = JSON.parse(localStorage.getItem(`${lib.configprefix}config`));
			if (!config || typeof config != 'object') throw 'err';
		}
		catch (err) {
			config = {};
		}
		Object.keys(config).forEach(value => {
			if (value.substr(value.indexOf('_mode_config') + 13) == mode) delete config[value];
		});
		localStorage.setItem(`${lib.configprefix}config`, JSON.stringify(config));
		localStorage.removeItem(`${lib.configprefix}${mode}`);
	}
	/**
	 * @param { number } position 
	 * @param { string } [character] 
	 * @param { string } [character2] 
	 */
	static addPlayer(position, character, character2) {
		if (position < 0 || position > game.players.length + game.dead.length || position == undefined) position = Math.ceil(Math.random() * (game.players.length + game.dead.length));
		const players = game.players.concat(game.dead);
		ui.arena.setNumber(players.length + 1);
		players.forEach(value => {
			if (parseInt(value.dataset.position) >= position) value.dataset.position = parseInt(value.dataset.position) + 1;
		});
		const player = ui.create.player(ui.arena).addTempClass('start');
		if (character) player.init(character, character2);
		game.players.push(player);
		player.dataset.position = position;
		game.arrangePlayers();
		return player;
	}
	/**
	 * @param { number } position 
	 * @param { string } [character] 
	 * @param { string } [animation] 
	 */
	static addFellow(position, character, animation) {
		game.addVideo('addFellow', null, [position, character, animation]);
		const player = ui.create.player(ui.arena).addTempClass(animation || 'start');
		player.dataset.position = position || game.players.length + game.dead.length;
		player.getId();
		if (character) player.init(character);
		game.players.push(player);
		game.arrangePlayers();
		return player;
	}
	/**
	 * @param { Player } player 
	 */
	static triggerEnter(player) {
		const next = game.createEvent('enterGame', false);
		next.player = player;
		next.setContent(() => {
			event.trigger('enterGame');
		});
		return next;
	}
	/**
	 * @param { Player } player 
	 */
	static restorePlayer(player) {
		if (game.players.includes(player) || game.dead.includes(player)) return;
		let position = parseInt(player.dataset.position);
		if (position < 0 || position > game.players.length + game.dead.length || position == undefined) position = Math.ceil(Math.random() * (game.players.length + game.dead.length));
		const players = game.players.concat(game.dead);
		ui.arena.setNumber(players.length + 1);
		players.forEach(value => {
			if (parseInt(value.dataset.position) >= position) value.dataset.position = parseInt(value.dataset.position) + 1;
		});
		game.players.push(player);
		delete player.removed;
		player.removeAttribute('style');
		player.addTempClass('start');
		ui.arena.appendChild(player);
		game.arrangePlayers();
		return player;
	}
	/**
	 * @param { Player } player 
	 */
	static removePlayer(player) {
		if (_status.roundStart == player) _status.roundStart = player.next || player.getNext() || game.players[0];
		const players = game.players.concat(game.dead);
		player.style.left = `${player.getLeft()}px`;
		player.style.top = `${player.getTop()}px`;
		if (player == undefined) player = game.dead[0] || game.me.next;
		const position = parseInt(player.dataset.position);
		players.forEach(value => {
			if (parseInt(value.dataset.position) > position) value.dataset.position = parseInt(value.dataset.position) - 1;
		});
		if (player.isAlive()) {
			player.next.previous = player.previous;
			player.previous.next = player.next;
		}
		player.nextSeat.previousSeat = player.previousSeat;
		player.previousSeat.nextSeat = player.nextSeat;
		player.delete();
		game.players.remove(player);
		game.dead.remove(player);
		ui.arena.setNumber(players.length - 1);
		player.removed = true;
		if (player == game.me) {
			ui.me.hide();
			ui.auto.hide();
			ui.wuxie.hide();
		}
		setTimeout(() => player.removeAttribute('style'), 500);
		return player;
	}
	/**
	 * @param { Player } player 
	 * @param { string } [character]
	 * @param { string } [character2]
	 */
	static replacePlayer(player, character, character2) {
		player.removed = true;
		const position = parseInt(player.dataset.position);
		game.players.remove(player);
		game.dead.remove(player);
		player.delete();
		const player2 = ui.create.player(ui.arena).addTempClass('start');
		if (character) player2.init(character, character2);
		game.players.push(player2);
		player2.dataset.position = position;
		player2.nextSeat = player.nextSeat;
		player2.previousSeat = player.previousSeat;
		player2.nextSeat.previousSeat = player2;
		player2.previousSeat.nextSeat = player2;
		let player3 = player2.nextSeat;
		while (player3.isDead()) {
			player3 = player3.nextSeat;
		}
		player3.previous = player2;
		player2.next = player3;
		let player4 = player2.previousSeat;
		while (player4.isDead()) {
			player4 = player4.previousSeat;
		}
		player4.next = player2;
		player2.previous = player4;
		if (_status.roundStart == player) _status.roundStart = player2;
		return player2;
	}
	static arrangePlayers() {
		if (game.chess && game.me) {
			let friendCount = 0, enemyCount = 0;
			const rand = Math.random() < 0.5, sortCount = new Map();
			game.players.forEach(value => {
				if (value.side == game.me.side) {
					if (rand) if (value == game.friendZhu) sortCount.set(value, -2);
					else sortCount.set(value, 2 * friendCount);
					else if (value == game.friendZhu) sortCount.set(value, -1);
					else sortCount.set(value, 2 * friendCount + 1);
					friendCount++;
					return;
				}
				if (rand) if (value == game.enemyZhu) sortCount.set(value, -1);
				else sortCount.set(value, 2 * enemyCount + 1);
				else if (value == game.enemyZhu) sortCount.set(value, -2);
				else sortCount.set(value, 2 * enemyCount);
				enemyCount++;
			});
			game.players.sort((a, b) => sortCount.get(a) - sortCount.get(b));
		}
		else game.players.sort(lib.sort.position);
		game.players.concat(game.dead).sort(lib.sort.position).forEach((value, index, array) => {
			if (index == 0) value.previousSeat = array[array.length - 1];
			else value.previousSeat = array[index - 1];
			if (index == array.length - 1) value.nextSeat = array[0];
			else value.nextSeat = array[index + 1];
		});
		game.players.forEach((value, index, array) => {
			if (index == 0) value.previous = array[array.length - 1];
			else value.previous = array[index - 1];
			if (index == array.length - 1) value.next = array[0];
			else value.next = array[index + 1];
		});
	}
	/**
	 * @param { string[] } skills 
	 * @param { Player } player 
	 * @param { string[] } exclude 
	 */
	static filterSkills(skills, player, exclude) {
		const out = skills.slice().removeArray(Object.keys(player.disabledSkills));
		if (!player.storage.skill_blocker || !player.storage.skill_blocker.length) return out;
		return out.filter(value => exclude && exclude.includes(value) || !get.is.blocked(value, player));
	}
	/**
	 * @param { string[] } skills 
	 */
	static expandSkills(skills) {
		return skills.addArray(skills.reduce((previousValue, currentValue) => {
			const info = get.info(currentValue);
			if (info) {
				if (Array.isArray(info.group)) previousValue.push(...info.group);
				else if (info.group) previousValue.push(info.group);
			}
			else console.log(currentValue);
			return previousValue;
		}, []))
	}
	/**
	 * @param { { [key:string]: any } } style 
	 */
	static css(style) {
		return Object.keys(style).forEach(value => {
			let uiStyle = ui.style[value];
			if (!uiStyle) {
				uiStyle = ui.style[value] = document.createElement('style');
				document.head.appendChild(uiStyle);
			}
			uiStyle.innerHTML = `${value}${JSON.stringify(style[value]).replace(/"/g, "")}`;
		})
	}
	/**
	 * @param { (player: Player) => boolean } func 
	 * @param { boolean } [includeOut] 
	 */
	static hasPlayer(func, includeOut) { return game.players.some(value => (includeOut || !value.isOut()) && func(value)) }
	/**
	 * @param { (player: Player) => boolean } func 
	 * @param { boolean } [includeOut] 
	 */
	static hasPlayer2(func, includeOut) { return game.players.concat(game.dead).some(value => (includeOut || !value.isOut()) && func(value)) }
	/**
	 * @param { (player: Player) => boolean } func 
	 * @param { boolean } [includeOut] 
	 */
	static countPlayer(func, includeOut) {
		if (typeof func != 'function') func = lib.filter.all;
		return game.players.reduce((previousValue, currentValue) => {
			if (!includeOut && currentValue.isOut()) return previousValue;
			const result = func(currentValue);
			if (typeof result == 'number') previousValue += result;
			else if (result) previousValue++;
			return previousValue;
		}, 0);
	}
	/**
	 * @param { (player: Player) => boolean } func 
	 * @param { boolean } [includeOut] 
	 */
	static countPlayer2(func, includeOut) {
		if (typeof func != 'function') func = lib.filter.all;
		return game.players.concat(game.dead).reduce((previousValue, currentValue) => {
			if (!includeOut && currentValue.isOut()) return previousValue;
			const result = func(currentValue);
			if (typeof result == 'number') previousValue += result;
			else if (result) previousValue++;
			return previousValue;
		}, 0);
	}
	/**
	 * @overload
	 * @returns { Player[] }
	 */
	/**
	 * @overload
	 * @param { (player: Player) => boolean } func 
	 * @param { Player[] } [list] 
	 * @param { boolean } [includeOut] 
	 * @returns { Player[] }
	 */
	static filterPlayer(func, list, includeOut) {
		if (!Array.isArray(list)) list = [];
		if (typeof func != 'function') func = lib.filter.all;
		return list.addArray(game.players.filter(value => (includeOut || !value.isOut()) && func(value)));
	}
	/**
	 * @overload
	 * @returns { Player[] }
	 */
	/**
	 * @overload
	 * @param { (player: Player) => boolean } func 
	 * @param { Player[] } [list] 
	 * @param { boolean } [includeOut] 
	 * @returns { Player[] }
	 */
	static filterPlayer2(func, list, includeOut) {
		if (!Array.isArray(list)) list = [];
		if (typeof func != 'function') func = lib.filter.all;
		return list.addArray(game.players.concat(game.dead).filter(value => (includeOut || !value.isOut()) && func(value)));
	}
	/**
	 * @param { (player: Player) => boolean } func 
	 * @param { boolean } [includeOut] 
	 */
	static findPlayer(func, includeOut) { return game.players.find(value => (includeOut || !value.isOut()) && func(value)) || null }
	/**
	 * @param { (player: Player) => boolean } func 
	 * @param { boolean } [includeOut] 
	 */
	static findPlayer2(func, includeOut) { return game.players.concat(game.dead).find(value => (includeOut || !value.isOut()) && func(value)) || null }
	/**
	 * @param { (player: Player) => boolean } func 
	 * @param { boolean } [all] 
	 */
	static findCards(func, all) {
		return Object.keys(lib.card).filter(value => {
			if (!lib.translate[`${value}_info`]) return false;
			if (lib.card[value].mode && lib.card[value].mode.includes(lib.config.mode) == false) return false;
			if (!all && !lib.inpile.includes(value)) return false;
			return func(value, lib.card[value]);
		})
	}
	static countGroup() {
		const list = lib.group.slice(0);
		return game.countPlayer(current => {
			if (!list.includes(current.group)) return false;
			list.remove(current.group);
			return true;
		});
	}
	/**
	 * 此方法用于对所有targets按顺序执行一个async函数。
	 * 
	 * @param { Player[] } targets 需要执行async方法的目标
	 * @param { (player: Player, i: number) => Promise<any | void> } asyncFunc 需要执行的async方法
	 * @param { (a: Player, b: Player) => number } sort 排序器，默认为lib.sort.seat
	 */
	static async doAsyncInOrder(targets,asyncFunc,sort){
		if(!sort) sort = lib.sort.seat;
		let sortedTargets = targets.sort(sort);
		for(let i=0;i<sortedTargets.length;i++){
			let target = sortedTargets[i];
			await Promise.resolve(asyncFunc(target,i));
		}
	}
}

export const game = Game;
