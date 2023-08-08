import { MarkdownView, Notice, Plugin, TAbstractFile, TFile, WorkspaceLeaf } from 'obsidian';

import * as MathLinks from 'obsidian-mathlinks'
import * as Dataview from 'obsidian-dataview';

import { MathContextSettings, DEFAULT_SETTINGS, MathSettingTab } from 'settings';
import { getCurrentMarkdown, getDataviewAPI, resolveSettings } from 'utils';
import { MathCallout, insertMathCalloutCallback } from 'math_callouts';
import { ContextSettingModal, MathCalloutModal } from 'modals';
import { insertDisplayMath, insertInlineMath } from 'key';
import { DisplayMathRenderChild, buildEquationNumberPlugin } from 'equation_number';
import { blockquoteMathPreviewPlugin } from 'math_live_preview_in_callouts';
import { ActiveNoteIndexer, LinkedNotesIndexer, VaultIndexer } from 'indexer';


export const VAULT_ROOT = '/';


export default class MathPlugin extends Plugin {
	settings: Record<string, MathContextSettings>;
	excludedFiles: string[];
	oldLinkMap: Dataview.IndexMap;

	async onload() {

		await this.loadSettings();

		this.app.workspace.onLayoutReady(() => {
			this.assertDataview();
			this.assertMathLinks();
		});

		this.registerEvent(
			this.app.metadataCache.on("dataview:index-ready",
				() => {
					this.setOldLinkMap();
					let indexer = new VaultIndexer(this.app, this);
					indexer.run();
				}
			)
		);

		this.registerEvent(
			this.app.metadataCache.on("dataview:metadata-change", async (...args) => {
				let changedFile = args[1];
				console.log("oldLinkMap (before): ", this.oldLinkMap);
				if (changedFile instanceof TFile) {
					await (new LinkedNotesIndexer(this.app, this, changedFile)).run();
				}
				this.setOldLinkMap();
				console.log("oldLinkMap (after): ", this.oldLinkMap);
			})
		);

		this.addCommand({
			id: 'insert-inline-math',
			name: 'Insert Inline Math',
			editorCallback: insertInlineMath
		});

		this.addCommand({
			id: 'insert-display-math',
			name: 'Insert Display Math',
			editorCallback: (editor) => insertDisplayMath(editor, false, this.app)
		});

		this.addCommand({
			id: 'insert-math-callout',
			name: 'Insert Math Callout',
			editorCallback: async (editor, context) => {
				if (context instanceof MarkdownView) {
					let modal = new MathCalloutModal(
						this.app,
						this,
						context,
						(config) => {
							if (context.file) {
								insertMathCalloutCallback(this.app, this, editor, config, context.file);
							}
						},
						"Insert",
						"Insert a Math Callout",
					);
					modal.resolveDefaultSettings(getCurrentMarkdown(this.app));
					modal.open();
				}
			}
		});

		this.addCommand({
			id: 'open-local-settings-for-current-note',
			name: 'Open Local Settings for the Current Note',
			callback: () => {
				let view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (view) {
					let modal = new ContextSettingModal(
						this.app,
						this, view.file.path,
						(settings) => {
							// @ts-ignore
							let cache = this.app.metadataCache.getCache(view.file.path);
							if (cache) {
								// @ts-ignore
								let indexer = new ActiveNoteIndexer(this.app, this, view);
								indexer.run(cache);
							}
						}
					);
					modal.resolveDefaultSettings(view.file);
					modal.open();
				}
			}
		});

		this.app.workspace.onLayoutReady(() => {
			this.app.workspace.iterateRootLeaves((leaf: WorkspaceLeaf) => {
				if (leaf.view instanceof MarkdownView) {
					let settings = resolveSettings(undefined, this, leaf.view.file);
					this.registerEditorExtension(buildEquationNumberPlugin(this.app, this, leaf.view.file.path, Boolean(settings.lineByLine)));
				}
			});
		});

		this.app.workspace.on("active-leaf-change", (leaf: WorkspaceLeaf) => {
			if (leaf.view instanceof MarkdownView) {
				let settings = resolveSettings(undefined, this, leaf.view.file);
				this.registerEditorExtension(buildEquationNumberPlugin(this.app, this, leaf.view.file.path, Boolean(settings.lineByLine)));
			}
		});

		this.registerEditorExtension(blockquoteMathPreviewPlugin);

		this.registerMarkdownPostProcessor(async (element, context) => {
			const callouts = element.querySelectorAll<HTMLElement>(".callout");

			for (let index = 0; index < callouts.length; index++) {
				let callout = callouts[index];

				let type = callout.getAttribute('data-callout');
				let metadata = callout.getAttribute('data-callout-metadata');
				if (metadata) {
					const isSmartCallout = (type?.toLowerCase() == 'math');

					if (isSmartCallout) {
						const settings = JSON.parse(metadata);

						let currentFile = this.app.vault.getAbstractFileByPath(context.sourcePath);
						if (currentFile instanceof TFile) {
							let smartCallout = new MathCallout(callout, this.app, this, settings, currentFile);
							await smartCallout.setRenderedTitleElements();
							context.addChild(smartCallout);
						}
					}
				}
			}
		});

		this.registerMarkdownPostProcessor((element, context) => {
			let mjxElements = element.querySelectorAll<HTMLElement>('mjx-container.MathJax mjx-math[display="true"]');
			if (mjxElements) {
				for (let i = 0; i < mjxElements.length; i++) {
					let mjxEl = mjxElements[i];
					let renderChild = new DisplayMathRenderChild(mjxEl, this.app, this, context);
					context.addChild(renderChild);
				}
			}
		});

		this.addSettingTab(new MathSettingTab(this.app, this));
	}

	onunload() {
		this.getMathLinksAPI()?.deleteAccount();
	}

	async loadSettings() {
		let loadedData = await this.loadData();
		if (loadedData) {
			let { settings, excludedFiles } = loadedData;
			this.settings = Object.assign({}, { [VAULT_ROOT]: DEFAULT_SETTINGS }, settings);
			this.excludedFiles = excludedFiles;
		} else {
			this.settings = Object.assign({}, { [VAULT_ROOT]: DEFAULT_SETTINGS }, undefined);
			this.excludedFiles = [];
		}
	}

	async saveSettings() {
		await this.saveData({ settings: this.settings, excludedFiles: this.excludedFiles });
	}

	assertDataview(): boolean {
		if (!Dataview.isPluginEnabled(this.app)) {
			new Notice(
				`${this.manifest.name}: Make sure Dataview is installed & enabled.`,
				100000
			);
			return false;
		}
		return true;
	}

	assertMathLinks(): boolean {
		if (!MathLinks.isPluginEnabled(this.app)) {
			new Notice(
				`${this.manifest.name}: Make sure MathLinks is installed & enabled.`,
				100000
			);
			return false;
		}
		return true;
	}

	getMathLinksAPI(): MathLinks.MathLinksAPIAccount | undefined {
		let account = MathLinks.getAPIAccount(this);
		if (account) {
			account.blockPrefix = "";
			account.enableFileNameBlockLinks = false;
			return account;
		}
	}

	setOldLinkMap() {
		let oldLinkMap = Dataview.getAPI()?.index.links;
		if (oldLinkMap) {
			this.oldLinkMap = structuredClone(oldLinkMap);
		}
	}
}
