<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { strings } from './lib/i18n';
  import { localDayKey } from './lib/calendar';
  import {
    DOTS_PER_MM,
    duplicateTemplate,
    initialWorkspace,
    newTemplate,
    type Align,
    type DateElement,
    type DateFormat,
    type FontFamily,
    type Frame,
    type LabelElement,
    type LabelTemplate,
    type PrinterSettings,
    type Workspace,
  } from './lib/model';
  import { canvasToRows, elementBox, overflowIds, renderLabel } from './lib/render';
  import { exportWorkspace, loadWorkspace, parseWorkspace, saveWorkspace } from './lib/storage';
  import { BlePrinter, type PrinterStatus } from './lib/printer/ble';

  type Tab = 'quick' | 'templates' | 'printer' | 'about' | 'editor';
  const printer = new BlePrinter();
  const frames: Frame[] = ['none', 'classic', 'jar', 'container', 'bag', 'leaves', 'dots'];
  let workspace: Workspace = initialWorkspace();
  let tab: Tab = 'quick';
  let editingTemplate: LabelTemplate | null = null;
  let selectedElementId = '';
  let productName = '';
  let copies = 1;
  let now = new Date();
  let printerName = '';
  let printerStatus: PrinterStatus = 'idle';
  let progress = 0;
  let message = '';
  let error = '';
  let previewCanvas: HTMLCanvasElement;
  let importInput: HTMLInputElement;
  let saveTimer: ReturnType<typeof setTimeout>;
  let dragging: { pointerId: number; startX: number; startY: number; x: number; y: number } | null =
    null;

  $: t = strings[workspace.language];
  $: selectedTemplate =
    workspace.templates.find((item) => item.id === workspace.selectedTemplateId) ??
    workspace.templates[0];
  $: activeTemplate = tab === 'editor' ? editingTemplate : selectedTemplate;
  $: selectedElement = editingTemplate?.elements.find((item) => item.id === selectedElementId);
  $: overflow = activeTemplate
    ? overflowIds(activeTemplate, productName, now, workspace.language)
    : [];
  $: {
    activeTemplate;
    productName;
    now;
    workspace.language;
    selectedElementId;
    previewCanvas;
    void tick().then(drawPreview);
  }

  onMount(() => {
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
      printer.disconnect();
    };
  });

  function drawPreview() {
    if (!previewCanvas || !activeTemplate) return;
    const image = renderLabel(activeTemplate, productName, now, workspace.language);
    previewCanvas.width = image.width;
    previewCanvas.height = image.height;
    previewCanvas.getContext('2d')!.drawImage(image, 0, 0);
    if (tab === 'editor' && selectedElement) {
      const ctx = previewCanvas.getContext('2d')!;
      const box = elementBox(ctx, selectedElement, productName, now, workspace.language);
      ctx.save();
      ctx.strokeStyle = '#6750a4';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(box.x - 3, box.y - 3, box.width + 6, box.height + 6);
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
    message = t.saved;
  }
  function addElement(type: LabelElement['type']) {
    if (!editingTemplate) return;
    const base = {
      id: crypto.randomUUID(),
      x: 44,
      y: Math.min(editingTemplate.height - 65, 140),
      width: 296,
      style: {
        fontFamily: 'Noto Sans' as FontFamily,
        fontSize: 22,
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
              prefix: '',
              format: 'short',
              offsetDays: 0,
              offsetMonths: 0,
              offsetYears: 0,
            };
    changeEditor((data) => data.elements.push(item));
    selectedElementId = item.id;
  }
  function onPointerDown(event: PointerEvent) {
    if (tab !== 'editor' || !editingTemplate || !previewCanvas) return;
    const rect = previewCanvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) * previewCanvas.width) / rect.width;
    const y = ((event.clientY - rect.top) * previewCanvas.height) / rect.height;
    const ctx = previewCanvas.getContext('2d')!;
    const found = [...editingTemplate.elements].reverse().find((item) => {
      const box = elementBox(ctx, item, productName, now, workspace.language);
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
    const x = ((event.clientX - rect.left) * previewCanvas.width) / rect.width;
    const y = ((event.clientY - rect.top) * previewCanvas.height) / rect.height;
    const nextX = num(String(dragging.x + x - dragging.startX), dragging.x, 0, 384);
    const nextY = num(
      String(dragging.y + y - dragging.startY),
      dragging.y,
      0,
      editingTemplate.height,
    );
    changeElement((item) => {
      item.x = nextX;
      item.y = nextY;
    });
  }
  function onPointerUp(event: PointerEvent) {
    if (dragging?.pointerId === event.pointerId) dragging = null;
  }
  async function choosePrinter() {
    error = '';
    message = '';
    try {
      printerName = await printer.choose();
    } catch (e) {
      if ((e as Error).name !== 'NotFoundError') error = String(e);
    }
  }
  async function sendPrint(template: LabelTemplate, product: string, count: number) {
    if (!printer.device) {
      error = t.errorPrinter;
      tab = 'printer';
      return;
    }
    if (template.elements.some((element) => element.type === 'product') && !product.trim()) {
      error = t.errorName;
      return;
    }
    const freshNow = new Date();
    now = freshNow;
    if (overflowIds(template, product, freshNow, workspace.language).length) {
      error = t.overflow;
      return;
    }
    error = '';
    message = '';
    progress = 0;
    try {
      await document.fonts.ready;
      const rows = canvasToRows(renderLabel(template, product, freshNow, workspace.language));
      await printer.print(rows, workspace.printer, count);
      message = t.printDone;
    } catch (e) {
      error = String(e);
    }
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
      message = t.imported;
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
    <div class="rail-brand"><span class="brand-mark">▤</span><strong>Thermal Print</strong></div>
    <nav>
      <button class:active={tab === 'quick'} onclick={() => (tab = 'quick')}
        >▣ <span>{t.quick}</span></button
      >
      <button
        class:active={tab === 'templates' || tab === 'editor'}
        onclick={() => (tab = 'templates')}>▤ <span>{t.templates}</span></button
      >
      <button class:active={tab === 'printer'} onclick={() => (tab = 'printer')}
        >▧ <span>{t.printer}</span></button
      >
      <button class:active={tab === 'about'} onclick={() => (tab = 'about')}
        >ⓘ <span>{t.about}</span></button
      >
    </nav>
  </aside>

  <div class="main-wrap">
    <header class="topbar">
      <div class="mobile-brand">
        <span class="brand-mark">▤</span><strong>Thermal Print</strong>
      </div>
      <div class="page-title">
        <h1>{tab === 'editor' ? t.edit : t[tab]}</h1>
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
            <label
              >{t.copies}<input
                type="number"
                min="1"
                max="20"
                value={copies}
                oninput={(e) => (copies = num(e.currentTarget.value, 1, 1, 20))}
              /></label
            >
            <div class="connection-line">
              <span class:online={printerStatus === 'connected'} class="status-dot"></span>
              <span>{printerName || t.noPrinter}</span>
            </div>
            {#if !BlePrinter.supported()}<p class="helper warning">
                {window.isSecureContext ? t.notSupported : t.secure}
              </p>{/if}
            <div class="action-stack">
              {#if !printer.device}<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                <md-outlined-button onclick={choosePrinter} disabled={!BlePrinter.supported()}
                  >{t.connect}</md-outlined-button
                >{/if}
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <md-filled-button
                onclick={() =>
                  selectedTemplate && void sendPrint(selectedTemplate, productName, copies)}
                disabled={printerStatus === 'printing' || !selectedTemplate || overflow.length > 0}
                >{t.print}</md-filled-button
              >
            </div>
            {#if printerStatus === 'printing'}<progress max="1" value={progress}></progress>{/if}
          </section>
          <section class="panel preview-panel">
            <div class="section-heading">
              <div>
                <span class="eyebrow">02 / {t.preview}</span>
                <h2>{t.preview}</h2>
              </div>
              {#if selectedTemplate}<span class="size-pill"
                  >48 × {Math.round(selectedTemplate.height / DOTS_PER_MM)} mm</span
                >{/if}
            </div>
            <div class="preview-stage">
              <canvas bind:this={previewCanvas} aria-label={t.preview}></canvas>
            </div>
            {#if overflow.length}<p class="helper warning">{t.overflow}</p>{/if}
          </section>
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
            </div>
            <p class="helper">{t.selectElement}</p>
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
                      ><option>Noto Sans</option><option>Noto Serif</option><option
                        >monospace</option
                      ></select
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
            <div class="button-row">
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <md-filled-button
                onclick={choosePrinter}
                disabled={!BlePrinter.supported() || printerStatus === 'printing'}
                >{t.connect}</md-filled-button
              >
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
            <label
              >{t.speed}<input
                type="number"
                min="1"
                max="255"
                value={workspace.printer.speed}
                onchange={(e) => setPrinterNumber('speed', e.currentTarget.value, 1, 255)}
              /></label
            >
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
        </div>
      {:else if tab === 'about'}
        <section class="panel about-panel">
          <img src="./icon.svg" alt="Thermal Print" width="96" height="96" />
          <h2>Thermal Print</h2>
          <p>{t.subtitle}. {t.localData}</p>
          <p>{t.compatible}</p>
          <p>{t.dateInfo}</p>
          <a
            href="https://github.com/olegg-mir/thermal-print"
            target="_blank"
            rel="noopener noreferrer">{t.repo} ↗</a
          >
        </section>
      {/if}
    </main>
  </div>

  <nav class="bottom-nav" aria-label="Navigation">
    <button class:active={tab === 'quick'} onclick={() => (tab = 'quick')}
      ><span>▣</span>{t.quick}</button
    >
    <button
      class:active={tab === 'templates' || tab === 'editor'}
      onclick={() => (tab = 'templates')}><span>▤</span>{t.templates}</button
    >
    <button class:active={tab === 'printer'} onclick={() => (tab = 'printer')}
      ><span>▧</span>{t.printer}</button
    >
    <button class:active={tab === 'about'} onclick={() => (tab = 'about')}
      ><span>ⓘ</span>{t.about}</button
    >
  </nav>
</div>
