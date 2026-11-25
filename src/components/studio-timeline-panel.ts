import { store } from '../state/store';
import { KIND_LABEL } from '../types';
import type { Layer } from '../types';
import { escapeHtml, formatTime, uid } from '../lib/format';

const PX_PER_SECOND = 76;

class StudioTimelinePanel extends HTMLElement {
  private playhead?: HTMLElement;
  private timeReadout?: HTMLElement;

  connectedCallback(): void {
    this.classList.add('timeline');
    this.innerHTML = `
      <div class="timeline-toolbar">
        <button class="play-btn" data-action="play" title="播放/暂停（空格）">▶</button>
        <div class="time-readout" data-role="time">00:00.0 / ${formatTime(store.project.duration)}</div>
        <label class="check-row"><input type="checkbox" data-setting="loop" checked />循环</label>
        <label class="check-row"><input type="checkbox" data-setting="timeFilter" />按时间点显隐</label>
        <div class="toolbar-divider"></div>
        <button class="btn small" data-action="add-cue">＋ 节奏 Cue</button>
        <button class="btn small ghost" data-action="export-sheet">参数表</button>
        <span class="kbd-hint" style="margin-left:auto">拖动片段改时间点，拖右缘改持续；点标尺定位播放头</span>
      </div>
      <div class="timeline-scroll" data-role="scroll">
        <div class="track-labels" data-role="labels"></div>
        <div class="timeline-tracks" data-role="tracks"></div>
      </div>
    `;

    this.querySelector('[data-action="play"]')?.addEventListener('click', () => store.togglePlay());
    this.querySelector('[data-action="add-cue"]')?.addEventListener('click', () => this.addCue());
    this.querySelector('[data-action="export-sheet"]')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('studio:open-export'));
    });
    this.querySelector('[data-setting="loop"]')?.addEventListener('change', (event) => {
      store.setLoop((event.target as HTMLInputElement).checked);
    });
    this.querySelector('[data-setting="timeFilter"]')?.addEventListener('change', (event) => {
      store.setTimeFilter((event.target as HTMLInputElement).checked);
    });

    store.on('change', () => this.render());
    store.on('selectionchange', () => this.render());
    store.on('timechange', () => this.updatePlayhead());
    store.on('playbackchange', () => this.updatePlayback());
    this.render();
  }

  private addCue(): void {
    const timeInput = window.prompt('Cue 时间（秒）', store.currentTime.toFixed(2));
    if (timeInput === null) return;
    const time = Number(timeInput);
    if (!Number.isFinite(time)) {
      store.notify('时间需要是数字', 'error');
      return;
    }
    const title = window.prompt('节奏节点名称', '新的剧情节点') ?? '新 Cue';
    store.mutate('添加节奏 Cue', () => {
      store.project.cues.push({ id: uid('cue'), time: Math.max(0, time), title: title.trim() || 'Cue' });
      store.project.cues.sort((a, b) => a.time - b.time);
    });
  }

  private render(): void {
    const labels = this.querySelector<HTMLElement>('[data-role="labels"]');
    const tracks = this.querySelector<HTMLElement>('[data-role="tracks"]');
    if (!labels || !tracks) return;

    const width = store.project.duration * PX_PER_SECOND + 120;
    const ordered = [...store.project.layers].reverse();

    labels.innerHTML = `
      <div class="ruler-corner">层 / 节奏时间点</div>
      ${ordered
        .map(
          (layer) => `
        <div class="track-label ${store.selectedIds.includes(layer.id) ? 'selected' : ''}" data-label-id="${layer.id}">
          <span class="kind-badge" style="--kind:${this.kindColor(layer)};width:18px;height:18px;font-size:10px">${this.kindIcon(layer)}</span>
          <span class="name">${escapeHtml(layer.name)}</span>
        </div>`,
        )
        .join('')}
    `;

    const seconds = Array.from({ length: Math.floor(store.project.duration) + 1 }, (_, i) => i);
    tracks.style.width = `${width}px`;
    tracks.innerHTML = `
      <div class="ruler" data-role="ruler" style="width:${width}px">
        ${seconds
          .map(
            (second) =>
              `<span class="ruler-label" style="left:${second * PX_PER_SECOND + 5}px">${second}s</span>`,
          )
          .join('')}
      </div>
      ${ordered
        .map(
          (layer) => `
        <div class="track" data-track-id="${layer.id}">
          ${this.renderClip(layer)}
        </div>`,
        )
        .join('')}
      ${store.project.cues
        .map(
          (cue) => `
        <div class="cue-marker" style="left:${cue.time * PX_PER_SECOND}px" title="${cue.time.toFixed(2)}s ${escapeHtml(cue.title)}">
          <span>${escapeHtml(cue.title)}</span>
        </div>`,
        )
        .join('')}
      <div class="playhead" data-role="playhead" style="left:${store.currentTime * PX_PER_SECOND}px"></div>
    `;

    this.playhead = tracks.querySelector<HTMLElement>('[data-role="playhead"]') ?? undefined;
    this.timeReadout = this.querySelector<HTMLElement>('[data-role="time"]') ?? undefined;
    this.bindTimelineInteractions(labels, tracks);
    this.updatePlayback();
    this.updatePlayhead();
  }

  private renderClip(layer: Layer): string {
    const selected = store.selectedIds.includes(layer.id);
    const color = this.kindColor(layer);
    const left = layer.start * PX_PER_SECOND;
    const width = Math.max(22, layer.duration * PX_PER_SECOND);
    return `
      <div class="clip ${selected ? 'selected' : ''}" data-clip-id="${layer.id}"
           style="--clip:${color};left:${left}px;width:${width}px"
           title="${escapeHtml(layer.name)}：${layer.start.toFixed(2)}s 开始，${layer.duration.toFixed(2)}s 持续">
        <span>${this.kindIcon(layer)}</span>
        <span style="overflow:hidden;text-overflow:ellipsis">${escapeHtml(layer.name)}</span>
        <span class="clip-time">${layer.start.toFixed(1)}s</span>
        <i data-resize="${layer.id}" style="position:absolute;top:0;right:0;width:9px;height:100%;cursor:ew-resize"></i>
      </div>
    `;
  }

  private kindColor(layer: Layer): string {
    if (layer.kind === 'light') return '#fbbf24';
    if (layer.kind === 'smoke') return '#a8b6c7';
    if (layer.kind === 'spark') return '#fb923c';
    if (layer.kind === 'background') return '#67e8f9';
    return '#a78bfa';
  }

  private kindIcon(layer: Layer): string {
    if (layer.kind === 'light') return '💡';
    if (layer.kind === 'smoke') return '🌫';
    if (layer.kind === 'spark') return '✦';
    if (layer.kind === 'background') return '📷';
    return '🖼';
  }

  private bindTimelineInteractions(labels: HTMLElement, tracks: HTMLElement): void {
    labels.querySelectorAll<HTMLElement>('[data-label-id]').forEach((label) => {
      label.addEventListener('click', () => store.select(label.dataset.labelId!));
    });

    tracks.querySelectorAll<HTMLElement>('[data-track-id]').forEach((track) => {
      track.addEventListener('click', (event) => {
        if ((event.target as HTMLElement).closest('.clip')) return;
        store.select(track.dataset.trackId!);
      });
    });

    const ruler = tracks.querySelector<HTMLElement>('[data-role="ruler"]');
    ruler?.addEventListener('pointerdown', (event) => {
      this.scrubToEvent(event, ruler);
      const onMove = (moveEvent: PointerEvent): void => this.scrubToEvent(moveEvent, ruler);
      const onUp = (): void => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });

    tracks.querySelectorAll<HTMLElement>('[data-clip-id]').forEach((clip) => {
      const id = clip.dataset.clipId!;
      clip.addEventListener('pointerdown', (event) => {
        if ((event.target as HTMLElement).closest('[data-resize]')) return;
        event.preventDefault();
        event.stopPropagation();
        store.select(id);
        const layer = store.project.layers.find((item) => item.id === id);
        if (!layer || layer.locked) return;
        const before = store.capture();
        const startX = event.clientX;
        const originalStart = layer.start;

        const onMove = (moveEvent: PointerEvent): void => {
          const delta = (moveEvent.clientX - startX) / PX_PER_SECOND;
          const next = Math.max(0, Math.min(store.project.duration - 0.1, originalStart + delta));
          const rounded = Math.round(next * 100) / 100;
          store.patchLayerLive(id, { start: rounded });
          // Selection rendering can replace the original clip node; always update the live one.
          const liveClip = tracks.querySelector<HTMLElement>(`[data-clip-id="${id}"]`);
          const liveTime = liveClip?.querySelector<HTMLElement>('.clip-time');
          if (liveClip) liveClip.style.left = `${rounded * PX_PER_SECOND}px`;
          if (liveTime) liveTime.textContent = `${rounded.toFixed(1)}s`;
        };
        const onUp = (): void => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          store.commitGesture('拖动时间点', before);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });
    });

    tracks.querySelectorAll<HTMLElement>('[data-resize]').forEach((handle) => {
      handle.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const id = handle.dataset.resize!;
        const clip = handle.closest<HTMLElement>('.clip')!;
        const layer = store.project.layers.find((item) => item.id === id);
        if (!layer || layer.locked) return;
        store.select(id);
        const before = store.capture();
        const startX = event.clientX;
        const originalDuration = layer.duration;

        const onMove = (moveEvent: PointerEvent): void => {
          const delta = (moveEvent.clientX - startX) / PX_PER_SECOND;
          const duration = Math.max(0.2, Math.round((originalDuration + delta) * 100) / 100);
          store.patchLayerLive(id, { duration });
          const liveClip = tracks.querySelector<HTMLElement>(`[data-clip-id="${id}"]`);
          if (liveClip) liveClip.style.width = `${Math.max(22, duration * PX_PER_SECOND)}px`;
        };
        const onUp = (): void => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          store.commitGesture('调整片段持续时间', before);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });
    });
  }

  private scrubToEvent(event: PointerEvent | MouseEvent, ruler: HTMLElement): void {
    const rect = ruler.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const time = Math.max(0, Math.min(store.project.duration, x / PX_PER_SECOND));
    store.setTime(Math.round(time * 100) / 100);
  }

  private updatePlayhead(): void {
    if (this.playhead) this.playhead.style.left = `${store.currentTime * PX_PER_SECOND}px`;
    if (this.timeReadout) {
      const button = this.querySelector<HTMLButtonElement>('[data-action="play"]');
      this.timeReadout.textContent = `${formatTime(store.currentTime)} / ${formatTime(store.project.duration)}`;
      if (button) button.textContent = store.playing ? '❚❚' : '▶';
    }
  }

  private updatePlayback(): void {
    const button = this.querySelector<HTMLButtonElement>('[data-action="play"]');
    if (button) {
      button.textContent = store.playing ? '❚❚' : '▶';
      button.classList.toggle('playing', store.playing);
    }
    const loop = this.querySelector<HTMLInputElement>('[data-setting="loop"]');
    if (loop) loop.checked = store.loop;
    const filter = this.querySelector<HTMLInputElement>('[data-setting="timeFilter"]');
    if (filter) filter.checked = store.timeFilter;
  }
}

customElements.define('studio-timeline-panel', StudioTimelinePanel);
