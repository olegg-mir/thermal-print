<script lang="ts">
  import { onMount } from 'svelte';
  import NavIcon from './NavIcon.svelte';
  import { strings } from './lib/i18n';
  import {
    formatDate,
    localDateInput,
    localDayKey,
    parseLocalDateInput,
    shiftedLocalDate,
  } from './lib/calendar';
  import { withExpiry } from './lib/quick-label';
  import { adaptiveTemplate } from './lib/adaptive';
  import {
    ADAPTIVE_TEMPLATE_ID,
    DOTS_PER_MM,
    PRINT_WIDTH,
    defaultPrinterSettings,
    duplicateTemplate,
    initialWorkspace,
    newTemplate,
    type AdaptiveSettings,
    type Align,
    type DateElement,
    type DateFormat,
    type FontFamily,
    type Frame,
    type LabelElement,
    type LabelTemplate,
    type PrinterSettings,
    type PrintHistoryEntry,
    type Theme,
    type Workspace,
  } from './lib/model';
  import {
    canvasToRows,
    editorViewport,
    elementBox,
    overflowIds,
    renderLabel,
    type RenderViewport,
  } from './lib/render';
  import { exportWorkspace, loadWorkspace, parseWorkspace, saveWorkspace } from './lib/storage';
  import { BlePrinter, type PrinterStatus } from './lib/printer/ble';

  type Tab = 'quick' | 'templates' | 'printer' | 'editor';
  const printer = new BlePrinter();
  const frames: Frame[] = [
    'none',
    'classic',
    'jar',
    'container',
    'bag',
    'leaves',
    'dots',
    'bottle',
    'freezer',
    'ribbon',
  ];
  const fonts: FontFamily[] = [
    'Noto Sans',
    'Noto Serif',
    'Roboto Condensed',
    'Montserrat',
    'Caveat',
    'monospace',
  ];
  let workspace: Workspace = initialWorkspace();
  let tab: Tab = 'quick';
  let editingTemplate: LabelTemplate | null = null;
  let selectedElementId = '';
  let productName = '';
  let shelfLifeMonths = 0;
  let shelfLifeDays = 0;
  let useShelfLife = false;
  let useCustomDate = false;
  let customDate = localDateInput(new Date());
  let useMultipleCopies = false;
  let showProductionDate = true;
  let quickOptionsOpen = false;
  let copies = 1;
  let fontRevision = 0;
  let now = new Date();
  let printerName = '';
  let printerStatus: PrinterStatus = 'idle';
  let progress = 0;
  let message = '';
  let error = '';
  let previewCanvas: HTMLCanvasElement;
  let importInput: HTMLInputElement;
  let saveTimer: ReturnType<typeof setTimeout>;
  let messageTimer: ReturnType<typeof setTimeout>;
  const readyFonts = new Set<string>();
  const previewRender: { canvas?: HTMLCanvasElement; signature: string; frame: number } = {
    signature: '',
    frame: 0,
  };
  let dragging: { pointerId: number; startX: number; startY: number; x: number; y: number } | null =
    null;
  let previewViewport: RenderViewport = { left: 0, top: 0, right: PRINT_WIDTH, bottom: 320 };

  $: t = strings[workspace.language];
  $: if (typeof document !== 'undefined') document.documentElement.lang = workspace.language;
  $: if (typeof document !== 'undefined') setDocumentTheme(workspace.theme);
  $: quickDate = useCustomDate ? parseLocalDateInput(customDate) : now;
  $: isAdaptive = workspace.selectedTemplateId === ADAPTIVE_TEMPLATE_ID;
  $: selectedTemplate =
    isAdaptive && quickDate
      ? makeAdaptiveTemplate(
          productName,
          quickDate,
          showProductionDate,
          useShelfLife ? shelfLifeMonths : 0,
          useShelfLife ? shelfLifeDays : 0,
          workspace.language,
          workspace.adaptive,
          fontRevision,
        )
      : (workspace.templates.find((item) => item.id === workspace.selectedTemplateId) ??
        workspace.templates[0]);
  $: quickTemplate =
    selectedTemplate && quickDate
      ? isAdaptive
        ? selectedTemplate
        : withExpiry(
            selectedTemplate,
            useShelfLife ? shelfLifeMonths : 0,
            useShelfLife ? shelfLifeDays : 0,
            quickDate,
            workspace.language,
          )
      : null;
  $: activeTemplate = tab === 'editor' ? editingTemplate : quickTemplate;
  $: previewDate = tab === 'editor' ? now : (quickDate ?? now);
  $: previewProduct = tab === 'editor' ? '' : productName;
  $: selectedElement = editingTemplate?.elements.find((item) => item.id === selectedElementId);
  $: overflow = activeTemplate
    ? overflowIds(activeTemplate, previewProduct, previewDate, workspace.language)
    : [];
  $: {
    activeTemplate;
    previewProduct;
    previewDate;
    workspace.language;
    selectedElementId;
    previewCanvas;
    schedulePreview();
  }

  function schedulePreview() {
    if (!previewCanvas || !activeTemplate) return;
    const signature = JSON.stringify({
      tab,
      template: activeTemplate,
      previewProduct,
      day: localDayKey(previewDate),
      language: workspace.language,
      selectedElementId,
    });
    if (previewRender.canvas === previewCanvas && previewRender.signature === signature) return;
    previewRender.canvas = previewCanvas;
    previewRender.signature = signature;
    cancelAnimationFrame(previewRender.frame);
    previewRender.frame = requestAnimationFrame(() => {
      drawPreview();
      if (activeTemplate?.elements.some((element) => !readyFonts.has(fontSpec(element)))) {
        void ensureFonts(activeTemplate).then(drawPreview);
      }
    });
  }

  function fontSpec(element: LabelElement): string {
    return `${element.style.bold ? 700 : 400} ${element.style.fontSize}px "${element.style.fontFamily}"`;
  }

  function makeAdaptiveTemplate(
    product: string,
    date: Date,
    showDate: boolean,
    months: number,
    days: number,
    language: Workspace['language'],
    settings: AdaptiveSettings,
    _fontRevision = 0,
  ): LabelTemplate {
    const ctx = document.createElement('canvas').getContext('2d')!;
    return adaptiveTemplate(
      {
        product,
        baseDate: date,
        showProductionDate: showDate,
        shelfLifeMonths: months,
        shelfLifeDays: days,
        language,
        settings,
      },
      ctx,
    );
  }

  function setDocumentTheme(theme: Theme): void {
    const dark =
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }

  async function ensureFonts(template: LabelTemplate): Promise<void> {
    const specs = [...new Set(template.elements.map(fontSpec))];
    const missing = specs.filter((spec) => !readyFonts.has(spec));
    if (!missing.length) return;
    await Promise.all(
      missing.map((spec) => document.fonts.load(spec, 'Продукт Product 0123456789')),
    );
    missing.forEach((spec) => readyFonts.add(spec));
    fontRevision += 1;
  }

  onMount(() => {
    const themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
    const refreshTheme = () => setDocumentTheme(workspace.theme);
    const handleVisibility = () => {
      if (document.hidden) printer.onPageHidden();
      else now = new Date();
    };
    const handlePageHide = () => printer.onPageHidden();
    const handlePageShow = () => {
      now = new Date();
    };
    themeMedia.addEventListener('change', refreshTheme);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    loadWorkspace()
      .then((data) => {
        workspace = data;
      })
      .catch((e) => {
        error = String(e);
      });
    printer.onStatus = (status) => {
      printerStatus = status;
    };
    printer.onProgress = (value) => {
      progress = value;
    };
    printer.onError = (value) => {
      error = value;
    };
    const timer = setInterval(() => {
      if (localDayKey(now) !== localDayKey(new Date())) now = new Date();
    }, 30000);
    return () => {
      clearInterval(timer);
      clearTimeout(saveTimer);
      clearTimeout(messageTimer);
      cancelAnimationFrame(previewRender.frame);
      themeMedia.removeEventListener('change', refreshTheme);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
      printer.disconnect();
    };
  });

  function drawPreview() {
    if (!previewCanvas || !activeTemplate) return;
    const viewport =
      tab === 'editor'
        ? dragging
          ? previewViewport
          : editorViewport(activeTemplate, previewProduct, previewDate, workspace.language)
        : undefined;
    previewViewport = viewport ?? {
      left: 0,
      top: 0,
      right: PRINT_WIDTH,
      bottom: activeTemplate.height,
    };
    const image = renderLabel(
      activeTemplate,
      previewProduct,
      previewDate,
      workspace.language,
      viewport,
    );
    previewCanvas.width = image.width;
    previewCanvas.height = image.height;
    previewCanvas.getContext('2d')!.drawImage(image, 0, 0);
    if (tab === 'editor' && selectedElement) {
      const ctx = previewCanvas.getContext('2d')!;
      const box = elementBox(ctx, selectedElement, previewProduct, now, workspace.language);
      ctx.save();
      ctx.strokeStyle = '#6750a4';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(
        box.x - previewViewport.left - 3,
        box.y - previewViewport.top - 3,
        box.width + 6,
        box.height + 6,
      );
      ctx.restore();
    }
  }

  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(
      () =>
        saveWorkspace(workspace).catch((e) => {
          error = String(e);
        }),
      300,
    );
  }
  function showMessage(value: string) {
    clearTimeout(messageTimer);
    message = value;
    messageTimer = setTimeout(() => (message = ''), 4000);
  }
  function changeWorkspace(fn: (data: Workspace) => void) {
    const next = structuredClone(workspace);
    fn(next);
    workspace = next;
    persist();
  }
  function changeEditor(fn: (data: LabelTemplate) => void) {
    if (!editingTemplate) return;
    const next = structuredClone(editingTemplate);
    fn(next);
    editingTemplate = next;
  }
  function changeElement(fn: (element: LabelElement) => void) {
    changeEditor((data) => {
      const item = data.elements.find((e) => e.id === selectedElementId);
      if (item) fn(item);
    });
  }
  function num(value: string, fallback: number, min: number, max: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
  }
  function startEditor(template?: LabelTemplate) {
    editingTemplate = template
      ? structuredClone(template)
      : newTemplate(
          workspace.language === 'ru' ? 'Новый шаблон' : 'New template',
          workspace.language,
        );
    selectedElementId = editingTemplate.elements[0]?.id ?? '';
    tab = 'editor';
  }
  function saveEditor() {
    if (!editingTemplate) return;
    const updated = {
      ...editingTemplate,
      name: editingTemplate.name.trim() || t.template,
      updatedAt: new Date().toISOString(),
    };
    changeWorkspace((data) => {
      const index = data.templates.findIndex((item) => item.id === updated.id);
      if (index >= 0) data.templates[index] = updated;
      else data.templates.push(updated);
      data.selectedTemplateId = updated.id;
    });
    editingTemplate = null;
    tab = 'templates';
    showMessage(t.saved);
  }
  function addElement(type: LabelElement['type'], source: 'today' | 'expiry' = 'today') {
    if (!editingTemplate) return;
    const base = {
      id: crypto.randomUUID(),
      x: 44,
      y: Math.min(editingTemplate.height - 65, source === 'expiry' ? 260 : 140),
      width: 296,
      style: {
        fontFamily: 'Noto Sans' as FontFamily,
        fontSize: type === 'date' ? 20 : 22,
        bold: false,
        align: 'center' as Align,
      },
    };
    const item: LabelElement =
      type === 'product'
        ? { ...base, type }
        : type === 'text'
          ? { ...base, type, text: workspace.language === 'ru' ? 'Текст' : 'Text' }
          : {
              ...base,
              type,
              source,
              prefix:
                source === 'expiry'
                  ? workspace.language === 'ru'
                    ? 'Годен до: '
                    : 'Best before: '
                  : '',
              format: 'short',
              offsetDays: 0,
              offsetMonths: 0,
              offsetYears: 0,
            };
    changeEditor((data) => data.elements.push(item));
    selectedElementId = item.id;
  }
  function positionElement(axis: 'x' | 'y', side: 'start' | 'center' | 'end') {
    if (!selectedElement || !editingTemplate) return;
    const ctx = previewCanvas?.getContext('2d');
    if (!ctx) return;
    const box = elementBox(ctx, selectedElement, '', now, workspace.language);
    const limit = axis === 'x' ? PRINT_WIDTH - box.width : editingTemplate.height - box.height;
    const value = Math.round(side === 'start' ? 0 : side === 'center' ? limit / 2 : limit);
    changeElement((item) => {
      item[axis] = Math.max(0, value);
    });
  }
  function snap(value: number, limit: number): number {
    const candidates = [0, limit / 2, limit];
    const target = candidates.find((point) => Math.abs(point - value) <= 8);
    return Math.round(Math.max(0, Math.min(limit, target ?? value)));
  }
  function onPointerDown(event: PointerEvent) {
    if (tab !== 'editor' || !editingTemplate || !previewCanvas) return;
    const rect = previewCanvas.getBoundingClientRect();
    const x =
      previewViewport.left + ((event.clientX - rect.left) * previewCanvas.width) / rect.width;
    const y =
      previewViewport.top + ((event.clientY - rect.top) * previewCanvas.height) / rect.height;
    const ctx = previewCanvas.getContext('2d')!;
    const found = [...editingTemplate.elements].reverse().find((item) => {
      const box = elementBox(ctx, item, previewProduct, now, workspace.language);
      return (
        x >= box.x - 8 &&
        x <= box.x + box.width + 8 &&
        y >= box.y - 8 &&
        y <= box.y + box.height + 8
      );
    });
    if (!found) {
      selectedElementId = '';
      return;
    }
    selectedElementId = found.id;
    dragging = { pointerId: event.pointerId, startX: x, startY: y, x: found.x, y: found.y };
    previewCanvas.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: PointerEvent) {
    if (!dragging || dragging.pointerId !== event.pointerId || !previewCanvas || !editingTemplate)
      return;
    const rect = previewCanvas.getBoundingClientRect();
    const x =
      previewViewport.left + ((event.clientX - rect.left) * previewCanvas.width) / rect.width;
    const y =
      previewViewport.top + ((event.clientY - rect.top) * previewCanvas.height) / rect.height;
    const element = editingTemplate.elements.find((item) => item.id === selectedElementId);
    if (!element) return;
    const box = elementBox(previewCanvas.getContext('2d')!, element, '', now, workspace.language);
    const nextX = snap(dragging.x + x - dragging.startX, PRINT_WIDTH - box.width);
    const nextY = snap(dragging.y + y - dragging.startY, editingTemplate.height - box.height);
    changeElement((item) => {
      item.x = nextX;
      item.y = nextY;
    });
  }
  function onPointerUp(event: PointerEvent) {
    if (dragging?.pointerId === event.pointerId) {
      dragging = null;
      drawPreview();
    }
  }
  async function choosePrinter(changeDevice = false) {
    error = '';
    message = '';
    try {
      printerName = changeDevice ? await printer.choose() : await printer.reconnect();
    } catch (e) {
      if ((e as Error).name !== 'NotFoundError') error = String(e);
    }
  }
  async function sendPrint(
    template: LabelTemplate,
    product: string,
    count: number,
    includeExpiry = false,
  ) {
    if (!printer.device) {
      error = t.errorPrinter;
      return;
    }
    if (template.elements.some((element) => element.type === 'product') && !product.trim()) {
      error = t.errorName;
      return;
    }
    const freshNow = new Date();
    now = freshNow;
    const printDate = includeExpiry && useCustomDate ? parseLocalDateInput(customDate) : freshNow;
    if (!printDate) {
      error = t.invalidDate;
      return;
    }
    error = '';
    message = '';
    progress = 0;
    try {
      if (template.id === ADAPTIVE_TEMPLATE_ID) {
        await document.fonts.load(
          `${workspace.adaptive.bold ? 700 : 400} ${workspace.adaptive.fontSize}px "${workspace.adaptive.fontFamily}"`,
          product,
        );
      }
      const printTemplate =
        template.id === ADAPTIVE_TEMPLATE_ID
          ? makeAdaptiveTemplate(
              product,
              printDate,
              showProductionDate,
              useShelfLife ? shelfLifeMonths : 0,
              useShelfLife ? shelfLifeDays : 0,
              workspace.language,
              workspace.adaptive,
            )
          : includeExpiry
            ? withExpiry(
                template,
                useShelfLife ? shelfLifeMonths : 0,
                useShelfLife ? shelfLifeDays : 0,
                printDate,
                workspace.language,
              )
            : template;
      await ensureFonts(printTemplate);
      const rows = canvasToRows(renderLabel(printTemplate, product, printDate, workspace.language));
      await printer.print(rows, workspace.printer, count);
      if (includeExpiry) {
        const entry: PrintHistoryEntry = {
          id: crypto.randomUUID(),
          printedAt: new Date().toISOString(),
          templateId: template.id,
          product,
          baseDate: localDateInput(printDate),
          shelfLifeMonths: useShelfLife ? shelfLifeMonths : 0,
          shelfLifeDays: useShelfLife ? shelfLifeDays : 0,
          copies: count,
          showProductionDate,
          ...(template.id === ADAPTIVE_TEMPLATE_ID ? { adaptive: { ...workspace.adaptive } } : {}),
        };
        changeWorkspace((data) => {
          data.history = [entry, ...data.history].slice(0, 10);
        });
        clearTimeout(saveTimer);
        try {
          await saveWorkspace(workspace);
        } catch (saveError) {
          error = `${t.historySaveError} ${String(saveError)}`;
        }
      }
      showMessage(t.printDone);
    } catch (e) {
      error = `${String(e)} ${t.printRecovery}`;
    }
  }
  function restoreHistory(entry: PrintHistoryEntry) {
    productName = entry.product;
    useCustomDate = true;
    customDate = entry.baseDate;
    shelfLifeMonths = entry.shelfLifeMonths;
    shelfLifeDays = entry.shelfLifeDays;
    useShelfLife = shelfLifeMonths > 0 || shelfLifeDays > 0;
    copies = entry.copies;
    useMultipleCopies = entry.copies > 1;
    showProductionDate = entry.showProductionDate;
    quickOptionsOpen = true;
    if (
      entry.templateId === ADAPTIVE_TEMPLATE_ID ||
      workspace.templates.some((item) => item.id === entry.templateId)
    ) {
      changeWorkspace((data) => {
        data.selectedTemplateId = entry.templateId;
        if (entry.templateId === ADAPTIVE_TEMPLATE_ID && entry.adaptive)
          data.adaptive = { ...entry.adaptive };
      });
    }
    tab = 'quick';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function testPrint() {
    const template = newTemplate('MX10 test', workspace.language);
    template.frame = 'classic';
    void sendPrint(template, 'MX10 TEST', 1);
  }
  function doExport() {
    const url = URL.createObjectURL(exportWorkspace(workspace));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'thermal-print-backup.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function doImport(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('Backup too large');
      const data = parseWorkspace(JSON.parse(await file.text()));
      workspace = data;
      await saveWorkspace(data);
      showMessage(t.imported);
      error = '';
    } catch (e) {
      error = String(e);
    }
    (event.currentTarget as HTMLInputElement).value = '';
  }
  function setPrinterNumber(key: keyof PrinterSettings, value: string, min: number, max: number) {
    changeWorkspace((data) => {
      data.printer[key] = num(value, data.printer[key], min, max);
    });
  }
</script>

<svelte:head>
  <title>Thermal Print — {t.subtitle}</title>
  <meta name="description" content={t.subtitle} />
</svelte:head>

<div class="shell">
  <aside class="rail" aria-label="Navigation">
    <div class="rail-brand">
      <span class="brand-mark"><NavIcon kind="print" /></span><strong>Thermal Print</strong>
    </div>
    <nav>
      <button class:active={tab === 'quick'} onclick={() => (tab = 'quick')}
        ><NavIcon kind="print" /> <span>{t.quick}</span></button
      >
      <button
        class:active={tab === 'templates' || tab === 'editor'}
        onclick={() => (tab = 'templates')}
        ><NavIcon kind="templates" /> <span>{t.templates}</span></button
      >
      <button class:active={tab === 'printer'} onclick={() => (tab = 'printer')}
        ><NavIcon kind="settings" /> <span>{t.settingsNav}</span></button
      >
    </nav>
  </aside>

  <div class="main-wrap">
    <header class="topbar">
      <div class="mobile-brand">
        <span class="brand-mark"><NavIcon kind="print" /></span><strong>Thermal Print</strong>
      </div>
      <div class="page-title">
        <h1>{tab === 'editor' ? t.edit : tab === 'printer' ? t.settingsNav : t[tab]}</h1>
        <p>{t.subtitle}</p>
      </div>
      <label class="language-switch"
        ><span class="sr-only">Language</span>
        <select
          value={workspace.language}
          onchange={(e) =>
            changeWorkspace(
              (data) => (data.language = e.currentTarget.value === 'en' ? 'en' : 'ru'),
            )}
        >
          <option value="ru">RU</option><option value="en">EN</option>
        </select>
      </label>
    </header>

    <main>
      {#if message}<div class="notice success" role="status">
          {message}<button aria-label="Dismiss" onclick={() => (message = '')}>×</button>
        </div>{/if}
      {#if error}<div class="notice error" role="alert">
          {error}<button aria-label="Dismiss" onclick={() => (error = '')}>×</button>
        </div>{/if}

      {#if tab === 'quick'}
        <div class="work-grid">
          <section class="panel controls">
            <div class="section-heading">
              <div>
                <span class="eyebrow">01 / {t.quick}</span>
                <h2>{t.quick}</h2>
              </div>
            </div>
            <label
              >{t.template}<select
                value={workspace.selectedTemplateId}
                onchange={(e) =>
                  changeWorkspace((data) => (data.selectedTemplateId = e.currentTarget.value))}
              >
                <option value={ADAPTIVE_TEMPLATE_ID}>{t.adaptiveTemplate}</option>
                {#each workspace.templates as item}<option value={item.id}>{item.name}</option
                  >{/each}
              </select></label
            >
            <label
              >{t.product}<input
                type="text"
                maxlength="200"
                placeholder={t.product}
                bind:value={productName}
              /></label
            >
            <details class="quick-options" bind:open={quickOptionsOpen}>
              <summary>{t.quickOptions}</summary>
              {#if isAdaptive}
                <div class="adaptive-settings">
                  <p class="adaptive-settings-title">{t.adaptiveStyle}</p>
                  <div class="two-fields">
                    <label
                      >{t.font}<select
                        value={workspace.adaptive.fontFamily}
                        onchange={(e) =>
                          changeWorkspace(
                            (data) =>
                              (data.adaptive.fontFamily = e.currentTarget.value as FontFamily),
                          )}
                        >{#each fonts as font}<option value={font}>{font}</option>{/each}</select
                      ></label
                    >
                    <label
                      >{t.adaptiveFontSize}<input
                        type="number"
                        min="16"
                        max="96"
                        step="1"
                        value={workspace.adaptive.fontSize}
                        oninput={(e) =>
                          changeWorkspace(
                            (data) =>
                              (data.adaptive.fontSize = num(e.currentTarget.value, 50, 16, 96)),
                          )}
                      /></label
                    >
                  </div>
                  <label class="checkbox-label"
                    ><input
                      type="checkbox"
                      checked={workspace.adaptive.bold}
                      onchange={(e) =>
                        changeWorkspace((data) => (data.adaptive.bold = e.currentTarget.checked))}
                    />{t.adaptiveBold}</label
                  >
                  <label class="checkbox-label"
                    ><input
                      type="checkbox"
                      checked={workspace.adaptive.frameEnabled}
                      onchange={(e) =>
                        changeWorkspace(
                          (data) => (data.adaptive.frameEnabled = e.currentTarget.checked),
                        )}
                    />{t.adaptiveFrame}</label
                  >
                  {#if workspace.adaptive.frameEnabled}
                    <label
                      >{t.frame}<select
                        value={workspace.adaptive.frame}
                        onchange={(e) =>
                          changeWorkspace(
                            (data) =>
                              (data.adaptive.frame = e.currentTarget.value as Exclude<
                                Frame,
                                'none'
                              >),
                          )}
                        >{#each frames.filter((frame) => frame !== 'none') as frame}<option
                            value={frame}>{t[`frame_${frame}`]}</option
                          >{/each}</select
                      ></label
                    >
                  {/if}
                </div>
                <label class="checkbox-label"
                  ><input
                    type="checkbox"
                    bind:checked={showProductionDate}
                  />{t.showProductionDate}</label
                >
              {/if}
              <label class="checkbox-label"
                ><input
                  type="checkbox"
                  checked={useCustomDate}
                  onchange={(e) => {
                    useCustomDate = e.currentTarget.checked;
                    if (useCustomDate) customDate = localDateInput(new Date());
                  }}
                />{t.customDate}</label
              >
              {#if useCustomDate}<label
                  >{t.baseDate}<input type="date" bind:value={customDate} /></label
                >{/if}
              <label class="checkbox-label"
                ><input type="checkbox" bind:checked={useShelfLife} />{t.useShelfLife}</label
              >
              {#if useShelfLife}
                <div class="two-fields">
                  <label
                    >{t.shelfMonths}<input
                      type="number"
                      min="0"
                      max="120"
                      value={shelfLifeMonths}
                      oninput={(e) => (shelfLifeMonths = num(e.currentTarget.value, 0, 0, 120))}
                    /></label
                  >
                  <label
                    >{t.shelfDays}<input
                      type="number"
                      min="0"
                      max="3650"
                      value={shelfLifeDays}
                      oninput={(e) => (shelfLifeDays = num(e.currentTarget.value, 0, 0, 3650))}
                    /></label
                  >
                </div>
                {#if quickDate && (shelfLifeMonths > 0 || shelfLifeDays > 0)}
                  <p class="expiry-result">
                    {t.expiryDate}: {formatDate(
                      shiftedLocalDate(quickDate, 0, shelfLifeMonths, shelfLifeDays),
                      'short',
                      workspace.language,
                    )}
                  </p>
                {/if}
              {/if}
              <label class="checkbox-label"
                ><input type="checkbox" bind:checked={useMultipleCopies} />{t.multipleCopies}</label
              >
              {#if useMultipleCopies}<label
                  >{t.copies}<input
                    type="number"
                    min="1"
                    max="20"
                    value={copies}
                    oninput={(e) => (copies = num(e.currentTarget.value, 1, 1, 20))}
                  /></label
                >{/if}
            </details>
            <div class="connection-line">
              <span class:online={printerStatus === 'connected'} class="status-dot"></span>
              <span>{printerName || t.noPrinter}</span>
            </div>
            {#if !BlePrinter.supported()}<p class="helper warning">
                {window.isSecureContext ? t.notSupported : t.secure}
              </p>{/if}
            <div class="action-stack">
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <md-outlined-button
                onclick={() => choosePrinter()}
                disabled={!BlePrinter.supported() ||
                  printerStatus === 'printing' ||
                  printerStatus === 'connecting'}
                >{printer.device ? t.reconnect : t.connect}</md-outlined-button
              >
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <md-filled-button
                onclick={() =>
                  selectedTemplate &&
                  void sendPrint(
                    selectedTemplate,
                    productName,
                    useMultipleCopies ? copies : 1,
                    true,
                  )}
                disabled={printerStatus === 'printing' ||
                  printerStatus === 'connecting' ||
                  !quickDate ||
                  !selectedTemplate}>{t.print}</md-filled-button
              >
            </div>
            {#if printerStatus === 'printing'}<progress max="1" value={progress}></progress>{/if}
          </section>
          <div class="preview-column">
            <section class="panel preview-panel">
              <div class="section-heading">
                <div>
                  <span class="eyebrow">02 / {t.preview}</span>
                  <h2>{t.preview}</h2>
                </div>
                {#if quickTemplate}<span class="size-pill"
                    >48 × {Math.round(quickTemplate.height / DOTS_PER_MM)} mm</span
                  >{/if}
              </div>
              <div class="preview-stage">
                <canvas bind:this={previewCanvas} aria-label={t.preview}></canvas>
              </div>
              {#if overflow.length}<p class="helper warning">{t.overflow}</p>{/if}
            </section>
            {#if workspace.history.length}
              <section class="panel history-panel">
                <div class="section-heading">
                  <div>
                    <span class="eyebrow">{t.recentLabels}</span>
                    <h2>{t.recentLabels}</h2>
                  </div>
                </div>
                <p class="helper">{t.historyHint}</p>
                <div class="history-list">
                  {#each workspace.history as entry (entry.id)}
                    <button type="button" class="history-row" onclick={() => restoreHistory(entry)}>
                      <strong>{entry.product}</strong>
                      <span
                        >{formatDate(
                          parseLocalDateInput(entry.baseDate) ?? new Date(),
                          'short',
                          workspace.language,
                        )} · {entry.templateId === ADAPTIVE_TEMPLATE_ID
                          ? t.adaptiveTemplate
                          : (workspace.templates.find((item) => item.id === entry.templateId)
                              ?.name ?? t.template)} · {entry.copies}×</span
                      >
                    </button>
                  {/each}
                </div>
              </section>
            {/if}
          </div>
        </div>
      {:else if tab === 'templates'}
        <section class="panel">
          <div class="section-heading">
            <div>
              <span class="eyebrow">{t.templates}</span>
              <h2>{t.templates}</h2>
            </div>
            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
            <md-filled-button onclick={() => startEditor()}>{t.newTemplate}</md-filled-button>
          </div>
          <div class="template-grid">
            <article class="template-card system-template">
              <div class="template-thumb">Aa</div>
              <div>
                <h3>{t.adaptiveTemplate}</h3>
                <p>{t.adaptiveDescription}</p>
              </div>
              <div class="card-actions">
                <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                <md-text-button
                  onclick={() => {
                    changeWorkspace((data) => (data.selectedTemplateId = ADAPTIVE_TEMPLATE_ID));
                    tab = 'quick';
                  }}>{t.quick}</md-text-button
                >
              </div>
            </article>
            {#each workspace.templates as item}
              <article class="template-card">
                <div class="template-thumb">
                  {#if item.frame === 'jar'}▤{:else if item.frame === 'container'}▣{:else}▢{/if}
                </div>
                <div>
                  <h3>{item.name}</h3>
                  <p>
                    48 × {Math.round(item.height / DOTS_PER_MM)} mm · {t[`frame_${item.frame}`]}
                  </p>
                </div>
                <div class="card-actions">
                  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                  <md-text-button
                    onclick={() => {
                      changeWorkspace((data) => (data.selectedTemplateId = item.id));
                      tab = 'quick';
                    }}>{t.quick}</md-text-button
                  >
                  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                  <md-text-button onclick={() => startEditor(item)}>{t.edit}</md-text-button>
                  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                  <md-text-button
                    onclick={() =>
                      changeWorkspace((data) => {
                        const copy = duplicateTemplate(item, data.language);
                        data.templates.push(copy);
                        data.selectedTemplateId = copy.id;
                      })}>{t.duplicate}</md-text-button
                  >
                  {#if workspace.templates.length > 1}<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                    <md-text-button
                      onclick={() => {
                        if (confirm(`${t.delete}: ${item.name}?`))
                          changeWorkspace((data) => {
                            data.templates = data.templates.filter((tpl) => tpl.id !== item.id);
                            if (data.selectedTemplateId === item.id)
                              data.selectedTemplateId = data.templates[0].id;
                          });
                      }}>{t.delete}</md-text-button
                    >{/if}
                </div>
              </article>
            {/each}
          </div>
        </section>
        <section class="panel compact">
          <h2>{t.export} / {t.import}</h2>
          <p class="helper">{t.localData}</p>
          <div class="button-row">
            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
            <md-outlined-button onclick={doExport}>{t.export}</md-outlined-button
            ><!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
            <md-outlined-button onclick={() => importInput.click()}>{t.import}</md-outlined-button>
          </div>
          <input
            bind:this={importInput}
            class="sr-only"
            type="file"
            accept="application/json,.json"
            onchange={doImport}
          />
        </section>
      {:else if tab === 'editor' && editingTemplate}
        <div class="editor-header">
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <md-text-button
            onclick={() => {
              editingTemplate = null;
              tab = 'templates';
            }}>{t.cancel}</md-text-button
          ><!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <md-filled-button onclick={saveEditor}>{t.save}</md-filled-button>
        </div>
        <div class="work-grid editor-grid">
          <section class="panel controls">
            <div class="section-heading">
              <div>
                <span class="eyebrow">{t.edit}</span>
                <h2>{editingTemplate.name}</h2>
              </div>
            </div>
            <label
              >{t.name}<input
                value={editingTemplate.name}
                maxlength="100"
                oninput={(e) => changeEditor((data) => (data.name = e.currentTarget.value))}
              /></label
            >
            <label
              >{t.height}<input
                type="number"
                min="20"
                max="300"
                value={editingTemplate.height / DOTS_PER_MM}
                oninput={(e) =>
                  changeEditor(
                    (data) => (data.height = num(e.currentTarget.value, 40, 20, 300) * DOTS_PER_MM),
                  )}
              /></label
            >
            <label
              >{t.frame}<select
                value={editingTemplate.frame}
                onchange={(e) =>
                  changeEditor((data) => (data.frame = e.currentTarget.value as Frame))}
              >
                {#each frames as frame}<option value={frame}>{t[`frame_${frame}`]}</option>{/each}
              </select></label
            >
            <div class="button-row wrap">
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <md-outlined-button onclick={() => addElement('product')}
                >{t.addProduct}</md-outlined-button
              ><!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <md-outlined-button onclick={() => addElement('text')}>{t.addText}</md-outlined-button
              ><!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <md-outlined-button onclick={() => addElement('date')}>{t.addDate}</md-outlined-button
              >
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <md-outlined-button onclick={() => addElement('date', 'expiry')}
                >{t.addExpiry}</md-outlined-button
              >
            </div>
            <p class="helper">{t.selectElement}</p>
            <label class="element-picker"
              >{t.selectBlock}<select
                value={selectedElementId}
                onchange={(e) => (selectedElementId = e.currentTarget.value)}
              >
                <option value="">{t.selectBlock}</option>
                {#each editingTemplate.elements as item}
                  <option value={item.id}
                    >{item.type === 'product'
                      ? t.product
                      : item.type === 'date'
                        ? item.source === 'expiry'
                          ? t.dateExpiry
                          : t.dateToday
                        : item.text.slice(0, 24)}</option
                  >
                {/each}
              </select></label
            >
            {#if selectedElement}
              <div class="element-editor">
                <h3>{t.element}: {selectedElement.type}</h3>
                {#if selectedElement.type === 'text'}<label
                    >{t.text}<textarea
                      rows="3"
                      value={selectedElement.text}
                      maxlength="500"
                      oninput={(e) =>
                        changeElement((item) => {
                          if (item.type === 'text') item.text = e.currentTarget.value;
                        })}></textarea></label
                  >{/if}
                {#if selectedElement.type === 'date'}
                  <label
                    >{t.dateSource}<select
                      value={selectedElement.source ?? 'today'}
                      onchange={(e) =>
                        changeElement((item) => {
                          if (item.type === 'date')
                            item.source = e.currentTarget.value === 'expiry' ? 'expiry' : 'today';
                        })}
                    >
                      <option value="today">{t.dateToday}</option>
                      <option value="expiry">{t.dateExpiry}</option>
                    </select></label
                  >
                  <label
                    >{t.prefix}<input
                      value={selectedElement.prefix}
                      maxlength="100"
                      oninput={(e) =>
                        changeElement((item) => {
                          if (item.type === 'date') item.prefix = e.currentTarget.value;
                        })}
                    /></label
                  >
                  <label
                    >{t.dateFormat}<select
                      value={selectedElement.format}
                      onchange={(e) =>
                        changeElement((item) => {
                          if (item.type === 'date')
                            item.format = e.currentTarget.value as DateFormat;
                        })}
                    >
                      <option value="short">29.09.2026</option><option value="shortYear"
                        >29.09.26</option
                      ><option value="iso">2026-09-29</option><option value="long"
                        >29 сентября 2026</option
                      >
                    </select></label
                  >
                  <div class="three-fields">
                    <label
                      >{t.years}<input
                        type="number"
                        min="-10"
                        max="10"
                        value={selectedElement.offsetYears}
                        oninput={(e) =>
                          changeElement((item) => {
                            if (item.type === 'date')
                              item.offsetYears = num(e.currentTarget.value, 0, -10, 10);
                          })}
                      /></label
                    >
                    <label
                      >{t.months}<input
                        type="number"
                        min="-120"
                        max="120"
                        value={selectedElement.offsetMonths}
                        oninput={(e) =>
                          changeElement((item) => {
                            if (item.type === 'date')
                              item.offsetMonths = num(e.currentTarget.value, 0, -120, 120);
                          })}
                      /></label
                    >
                    <label
                      >{t.days}<input
                        type="number"
                        min="-3650"
                        max="3650"
                        value={selectedElement.offsetDays}
                        oninput={(e) =>
                          changeElement((item) => {
                            if (item.type === 'date')
                              item.offsetDays = num(e.currentTarget.value, 0, -3650, 3650);
                          })}
                      /></label
                    >
                  </div>
                {/if}
                <div class="two-fields">
                  <label
                    >{t.font}<select
                      value={selectedElement.style.fontFamily}
                      onchange={(e) =>
                        changeElement(
                          (item) => (item.style.fontFamily = e.currentTarget.value as FontFamily),
                        )}
                      >{#each fonts as font}<option value={font}>{font}</option>{/each}</select
                    ></label
                  >
                  <label
                    >{t.fontSize}<input
                      type="number"
                      min="8"
                      max="96"
                      value={selectedElement.style.fontSize}
                      oninput={(e) =>
                        changeElement(
                          (item) => (item.style.fontSize = num(e.currentTarget.value, 20, 8, 96)),
                        )}
                    /></label
                  >
                </div>
                <div class="two-fields">
                  <label
                    >{t.align}<select
                      value={selectedElement.style.align}
                      onchange={(e) =>
                        changeElement(
                          (item) => (item.style.align = e.currentTarget.value as Align),
                        )}
                      ><option value="left">{t.left}</option><option value="center"
                        >{t.center}</option
                      ><option value="right">{t.right}</option></select
                    ></label
                  >
                  <label class="checkbox-label"
                    ><input
                      type="checkbox"
                      checked={selectedElement.style.bold}
                      onchange={(e) =>
                        changeElement((item) => (item.style.bold = e.currentTarget.checked))}
                    />{t.bold}</label
                  >
                </div>
                <div class="three-fields">
                  <label
                    >{t.x}<input
                      type="number"
                      min="0"
                      max="384"
                      value={selectedElement.x}
                      oninput={(e) =>
                        changeElement((item) => (item.x = num(e.currentTarget.value, 44, 0, 384)))}
                    /></label
                  >
                  <label
                    >{t.y}<input
                      type="number"
                      min="0"
                      max={editingTemplate.height}
                      value={selectedElement.y}
                      oninput={(e) =>
                        changeElement(
                          (item) =>
                            (item.y = num(e.currentTarget.value, 100, 0, editingTemplate!.height)),
                        )}
                    /></label
                  >
                  <label
                    >{t.width}<input
                      type="number"
                      min="24"
                      max="384"
                      value={selectedElement.width}
                      oninput={(e) =>
                        changeElement(
                          (item) => (item.width = num(e.currentTarget.value, 296, 24, 384)),
                        )}
                    /></label
                  >
                </div>
                <div class="position-controls">
                  <h4>{t.position}</h4>
                  <div class="position-row">
                    <span>{t.positionHorizontal}</span>
                    <button type="button" onclick={() => positionElement('x', 'start')}
                      >{t.left}</button
                    >
                    <button type="button" onclick={() => positionElement('x', 'center')}
                      >{t.center}</button
                    >
                    <button type="button" onclick={() => positionElement('x', 'end')}
                      >{t.right}</button
                    >
                  </div>
                  <div class="position-row">
                    <span>{t.positionVertical}</span>
                    <button type="button" onclick={() => positionElement('y', 'start')}
                      >{t.top}</button
                    >
                    <button type="button" onclick={() => positionElement('y', 'center')}
                      >{t.center}</button
                    >
                    <button type="button" onclick={() => positionElement('y', 'end')}
                      >{t.bottom}</button
                    >
                  </div>
                </div>
                <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                <md-text-button
                  onclick={() => {
                    changeEditor(
                      (data) =>
                        (data.elements = data.elements.filter(
                          (item) => item.id !== selectedElementId,
                        )),
                    );
                    selectedElementId = '';
                  }}>{t.removeElement}</md-text-button
                >
              </div>
            {/if}
          </section>
          <section class="panel preview-panel">
            <div class="section-heading">
              <div>
                <span class="eyebrow">{t.preview}</span>
                <h2>48 × {Math.round(editingTemplate.height / DOTS_PER_MM)} mm</h2>
              </div>
            </div>
            <div class="preview-stage editor-stage">
              <canvas
                bind:this={previewCanvas}
                aria-label={t.preview}
                onpointerdown={onPointerDown}
                onpointermove={onPointerMove}
                onpointerup={onPointerUp}
                onpointercancel={onPointerUp}
              ></canvas>
            </div>
            {#if overflow.length}<p class="helper warning">{t.overflow}</p>{/if}
            <p class="helper">{t.editorSample}</p>
            <p class="helper">{t.dateInfo}</p>
          </section>
        </div>
      {:else if tab === 'printer'}
        <div class="settings-grid">
          <section class="panel">
            <span class="eyebrow">MX10 / BLE</span>
            <h2>{t.connection}</h2>
            <div class="connection-card">
              <span class:online={printerStatus === 'connected'} class="status-dot"></span>
              <div>
                <strong>{printerName || t.noPrinter}</strong>
                <p>{t[`status_${printerStatus}`]}</p>
              </div>
            </div>
            {#if !BlePrinter.supported()}<p class="helper warning">
                {window.isSecureContext ? t.notSupported : t.secure}
              </p>{/if}
            <div class="button-row wrap">
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <md-filled-button
                onclick={() => choosePrinter()}
                disabled={!BlePrinter.supported() ||
                  printerStatus === 'printing' ||
                  printerStatus === 'connecting'}
                >{printer.device ? t.reconnect : t.connect}</md-filled-button
              >
              {#if printer.device}
                <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                <md-outlined-button
                  onclick={() => choosePrinter(true)}
                  disabled={printerStatus === 'printing' || printerStatus === 'connecting'}
                  >{t.chooseAnother}</md-outlined-button
                >
              {/if}
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <md-outlined-button
                onclick={testPrint}
                disabled={!printer.device || printerStatus === 'printing'}
                >{t.test}</md-outlined-button
              >
            </div>
            <p class="helper">{t.compatible}</p>
            <p class="helper">{t.calibration}</p>
          </section>
          <section class="panel">
            <span class="eyebrow">MX10 / 384 DOTS</span>
            <h2>{t.settings}</h2>
            <label
              >{t.energy}<input
                type="number"
                min="0"
                max="65535"
                value={workspace.printer.energy}
                onchange={(e) => setPrinterNumber('energy', e.currentTarget.value, 0, 65535)}
              /></label
            >
            <input
              class="setting-slider"
              type="range"
              min="0"
              max="65535"
              step="1"
              value={workspace.printer.energy}
              aria-label={t.energy}
              oninput={(e) => setPrinterNumber('energy', e.currentTarget.value, 0, 65535)}
            />
            <label
              >{t.speed}<input
                type="number"
                min="1"
                max="255"
                value={workspace.printer.speed}
                onchange={(e) => setPrinterNumber('speed', e.currentTarget.value, 1, 255)}
              /></label
            >
            <input
              class="setting-slider"
              type="range"
              min="1"
              max="255"
              step="1"
              value={workspace.printer.speed}
              aria-label={t.speed}
              oninput={(e) => setPrinterNumber('speed', e.currentTarget.value, 1, 255)}
            />
            <label
              >{t.preFeed}<input
                type="number"
                min="0"
                max="256"
                value={workspace.printer.preFeed}
                onchange={(e) => setPrinterNumber('preFeed', e.currentTarget.value, 0, 256)}
              /></label
            >
            <label
              >{t.postFeed}<input
                type="number"
                min="0"
                max="256"
                value={workspace.printer.postFeed}
                onchange={(e) => setPrinterNumber('postFeed', e.currentTarget.value, 0, 256)}
              /></label
            >
            <button
              class="defaults-button"
              type="button"
              onclick={() =>
                changeWorkspace((data) => {
                  data.printer.energy = defaultPrinterSettings.energy;
                  data.printer.preFeed = defaultPrinterSettings.preFeed;
                  data.printer.postFeed = defaultPrinterSettings.postFeed;
                })}>{t.mx10Defaults}</button
            >
            <details>
              <summary>{t.advanced}</summary><label
                >{t.packetSize}<input
                  type="number"
                  min="20"
                  max="200"
                  value={workspace.printer.packetSize}
                  onchange={(e) => setPrinterNumber('packetSize', e.currentTarget.value, 20, 200)}
                /></label
              >
              <label
                >{t.packetDelay}<input
                  type="number"
                  min="0"
                  max="100"
                  value={workspace.printer.packetDelay}
                  onchange={(e) => setPrinterNumber('packetDelay', e.currentTarget.value, 0, 100)}
                /></label
              >
            </details>
          </section>
          <section class="panel about-panel">
            <span class="eyebrow">Thermal Print</span>
            <h2>{t.appearance}</h2>
            <label
              >{t.theme}<select
                value={workspace.theme}
                onchange={(e) =>
                  changeWorkspace((data) => (data.theme = e.currentTarget.value as Theme))}
              >
                <option value="light">{t.theme_light}</option>
                <option value="dark">{t.theme_dark}</option>
                <option value="system">{t.theme_system}</option>
              </select></label
            >
            <div class="about-content">
              <img src="./icon.svg" alt="Thermal Print" width="64" height="64" />
              <div>
                <h3>{t.about}</h3>
                <p>{t.subtitle}. {t.localData}</p>
                <p>{t.compatible}</p>
                <p>{t.dateInfo}</p>
                <a
                  href="https://github.com/olegg-mir/thermal-print"
                  target="_blank"
                  rel="noopener noreferrer">{t.repo} ↗</a
                >
              </div>
            </div>
          </section>
        </div>
      {/if}
    </main>
  </div>

  <nav class="bottom-nav" aria-label="Navigation">
    <button class:active={tab === 'quick'} onclick={() => (tab = 'quick')}
      ><span><NavIcon kind="print" /></span>{t.quick}</button
    >
    <button
      class:active={tab === 'templates' || tab === 'editor'}
      onclick={() => (tab = 'templates')}
      ><span><NavIcon kind="templates" /></span>{t.templates}</button
    >
    <button class:active={tab === 'printer'} onclick={() => (tab = 'printer')}
      ><span><NavIcon kind="settings" /></span>{t.settingsNav}</button
    >
  </nav>
</div>
