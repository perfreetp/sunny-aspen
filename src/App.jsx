import { useEffect, useRef, useState } from 'react';
import { Board, LAYERS, niceScale } from './board/Board';

const SAMPLE = `SJ-01,蜗壳,518.60
SJ-02,座环,519.20
SJ-03,顶盖,521.40
SJ-04,转轮,520.00
SJ-05,主轴,524.50
SJ-06,底环,519.00
SJ-07,尾水管锥管,515.30
SJ-08,导水机构,520.80`;

const HINTS = {
  select: '单击选中 / 拖动移动 / 框选整体变换;空格+拖动平移,滚轮缩放,Delete 删除,Ctrl+Z 撤销',
  pan: '拖动平移画布',
  'calib-runner': '在底图上点击转轮直径的两个端点(先确认工具栏里的 D1 米数)',
  'calib-elev': '在安装高程线上点击一点(先确认工具栏里的高程值)',
  section: '按住拖动,沿机组流道拉一条剖切线',
  dim: '按住拖动,在蜗壳 / 尾水管控制尺寸处画尺寸线',
};

let eqUid = 1;

function parseEquip(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split(/[,\t,、;]+|\s{2,}/).filter(Boolean);
      const elev = parseFloat(parts[2]);
      return {
        id: 'eq' + eqUid++,
        code: parts[0] || '',
        name: parts[1] || '',
        elev: isNaN(elev) ? null : elev,
      };
    })
    .filter((r) => r.code);
}

export default function App() {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const mainFileRef = useRef(null);
  const flowFileRef = useRef(null);

  const [board, setBoard] = useState(null);
  const [mode, setMode] = useState('select');
  const [layers, setLayers] = useState(null);
  const [calib, setCalib] = useState({ pxPerMeter: 0, datumElev: 0, runnerD: 0 });
  const [zoom, setZoom] = useState(1);
  const [hist, setHist] = useState({ undo: 0, redo: 0 });
  const [sel, setSel] = useState({ count: 0, tags: 0, fontSize: '' });
  const [error, setError] = useState('');

  const [runnerD, setRunnerD] = useState('5.00');
  const [datumElev, setDatumElev] = useState('520.00');
  const [bandM, setBandM] = useState('8');
  const [fontSize, setFontSize] = useState('18');
  const [title, setTitle] = useState('抽水蓄能机组剖切交底图');
  const [dimStyle, setDimStyle] = useState({ strokeWidth: 1.5, arrowSize: 9, fontSize: 14 });

  const [equipments, setEquipments] = useState([]);
  const [placed, setPlaced] = useState({});
  const [pasteText, setPasteText] = useState('');

  // 初始化画布
  useEffect(() => {
    const b = new Board(canvasRef.current, hostRef.current, {
      onLayers: setLayers,
      onCalib: setCalib,
      onZoom: setZoom,
      onHist: setHist,
      onSelect: setSel,
      onError: (msg) => {
        setError(msg);
        setTimeout(() => setError(''), 4000);
      },
      onModeDone: () => setMode('select'),
    });
    setBoard(b);
    window.__board = b; // 调试/自动化测试钩子
    return () => b.dispose();
  }, []);

  useEffect(() => {
    board?.setMode(mode);
  }, [board, mode]);

  useEffect(() => {
    board?.setCalibInputs({
      runnerD: parseFloat(runnerD) || 0,
      datumElev: parseFloat(datumElev) || 0,
    });
  }, [board, runnerD, datumElev]);

  useEffect(() => {
    board?.setBandMeters(parseFloat(bandM) || 8);
  }, [board, bandM]);

  useEffect(() => {
    board?.setDimStyle(dimStyle);
  }, [board, dimStyle]);

  // 键盘:撤销 / 重做 / 删除
  useEffect(() => {
    if (!board) return;
    const h = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (board.canvas.getActiveObject()?.isEditing) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') {
        e.preventDefault();
        e.shiftKey ? board.redo() : board.undo();
      } else if ((e.ctrlKey || e.metaKey) && k === 'y') {
        e.preventDefault();
        board.redo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        board.deleteSelection();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [board]);

  const importFile = (role) => (e) => {
    const f = e.target.files?.[0];
    if (f && board) board.importImage(f, role);
    e.target.value = '';
  };

  const parseAndSet = (text) => {
    const rows = parseEquip(text);
    if (rows.length) {
      setEquipments(rows);
      setPlaced({});
    }
  };

  const placeTag = (eq) => {
    board?.placeTag(eq);
    setPlaced((p) => ({ ...p, [eq.id]: true }));
  };

  const placeAll = () => {
    if (!board || !equipments.length) return;
    board.placeAllTags(equipments);
    const all = {};
    equipments.forEach((e) => (all[e.id] = true));
    setPlaced(all);
  };

  const applyFontSize = () => {
    const px = parseFloat(fontSize);
    if (!px) return;
    const n = board?.setTagFontSize(px) ?? 0;
    if (!n) {
      setError('请先在画布上选中编号标注');
      setTimeout(() => setError(''), 3000);
    }
  };

  const scale = niceScale(calib.pxPerMeter, zoom);
  const modeBtn = (m, label) => (
    <button
      key={m}
      className={'btn' + (mode === m ? ' active' : '')}
      onClick={() => setMode(mode === m ? 'select' : m)}
    >
      {label}
    </button>
  );

  return (
    <div className="app">
      <header className="toolbar">
        <div className="group">
          <span className="glabel">底图</span>
          <button className="btn" onClick={() => mainFileRef.current.click()}>导入总装图</button>
          <button className="btn" onClick={() => flowFileRef.current.click()}>导入流道图</button>
          <input ref={mainFileRef} type="file" accept="image/*" hidden onChange={importFile('main')} />
          <input ref={flowFileRef} type="file" accept="image/*" hidden onChange={importFile('flow')} />
        </div>
        <div className="group">
          <span className="glabel">标定</span>
          {modeBtn('calib-runner', '①转轮直径')}
          <input className="num" value={runnerD} onChange={(e) => setRunnerD(e.target.value)} title="转轮直径 D1 (m)" />
          <span className="unit">m</span>
          {modeBtn('calib-elev', '②安装高程')}
          <input className="num" value={datumElev} onChange={(e) => setDatumElev(e.target.value)} title="安装高程 (m)" />
          <span className="unit">m</span>
          <span className="calib-info">
            {calib.pxPerMeter ? `${calib.pxPerMeter.toFixed(1)} px/m` : '未标定'}
          </span>
        </div>
        <div className="group">
          <span className="glabel">剖切</span>
          {modeBtn('section', '画剖切线')}
          <button className="btn" onClick={() => board?.generateSection()}>生成/更新剖切视图</button>
          <span className="unit">带宽</span>
          <input className="num" value={bandM} onChange={(e) => setBandM(e.target.value)} />
          <span className="unit">m</span>
        </div>
        <div className="group">
          <span className="glabel">标注</span>
          {modeBtn('dim', '尺寸标注')}
          <input className="num" value={fontSize} onChange={(e) => setFontSize(e.target.value)} title="字号" />
          <button className="btn" onClick={applyFontSize}>改字号{sel.tags ? `(${sel.tags})` : ''}</button>
        </div>
        <div className="group">
          {modeBtn('select', '选择')}
          {modeBtn('pan', '平移')}
          <button className="btn" disabled={!hist.undo} onClick={() => board?.undo()}>撤销</button>
          <button className="btn" disabled={!hist.redo} onClick={() => board?.redo()}>重做</button>
        </div>
        <div className="group">
          <input className="title-input" value={title} onChange={(e) => setTitle(e.target.value)} title="图名" />
          <button className="btn primary" onClick={() => board?.exportPNG(equipments, title)}>导出交底图</button>
        </div>
      </header>

      <div className="main">
        <div className="canvas-wrap" ref={hostRef}>
          <canvas ref={canvasRef} />
          <div className="overlay north">
            <svg viewBox="0 0 40 64" width="34" height="54">
              <polygon points="20,4 30,34 20,27 10,34" fill="#c0392b" stroke="#7b241c" strokeWidth="1" />
              <text x="20" y="52" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#222">N</text>
            </svg>
          </div>
          <div className="overlay scalebar">
            {scale ? (
              <>
                <div className="sb-label">{scale.meters >= 1 ? `${scale.meters} m` : `${scale.meters * 100} cm`}</div>
                <div className="sb-bar" style={{ width: scale.px }}>
                  <div className="sb-half" />
                </div>
              </>
            ) : (
              <div className="sb-label dim">未标定比例</div>
            )}
          </div>
          <div className="overlay status">
            <span>{HINTS[mode]}</span>
            {error && <span className="error">{error}</span>}
            <span className="zoom">{(zoom * 100).toFixed(0)}%</span>
          </div>
        </div>

        <aside className="side">
          <section className="panel">
            <h3>图层</h3>
            {layers &&
              LAYERS.map((l) => (
                <div className="layer-row" key={l.id}>
                  <span className="layer-name">{l.name}</span>
                  <button
                    className={'icon-btn' + (layers[l.id].visible ? ' on' : '')}
                    title="显隐"
                    onClick={() => board?.toggleLayer(l.id, 'visible')}
                  >
                    {layers[l.id].visible ? '👁' : '―'}
                  </button>
                  <button
                    className={'icon-btn' + (layers[l.id].locked ? ' on' : '')}
                    title="锁定(锁住点不中)"
                    onClick={() => board?.toggleLayer(l.id, 'locked')}
                  >
                    {layers[l.id].locked ? '🔒' : '🔓'}
                  </button>
                </div>
              ))}
          </section>

          <section className="panel">
            <h3>设备编号表(图签)</h3>
            <textarea
              rows={4}
              placeholder={'粘贴图签内容,每行一条:\n编号,名称,安装高程'}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
            />
            <div className="row">
              <button className="btn" onClick={() => parseAndSet(pasteText)}>解析粘贴</button>
              <button className="btn" onClick={() => { setPasteText(SAMPLE); parseAndSet(SAMPLE); }}>示例数据</button>
              <button className="btn" disabled={!equipments.length} onClick={placeAll}>全部贴标</button>
            </div>
            <div className="eq-table">
              {equipments.map((eq) => (
                <div className="eq-row" key={eq.id}>
                  <span className="eq-code">{eq.code}</span>
                  <span className="eq-name">{eq.name}</span>
                  <span className="eq-elev">{eq.elev != null ? eq.elev.toFixed(2) : '—'}</span>
                  <button className="btn small" onClick={() => placeTag(eq)}>
                    {placed[eq.id] ? '再贴' : '贴标'}
                  </button>
                </div>
              ))}
              {!equipments.length && <div className="empty">暂无设备,粘贴图签或加载示例</div>}
            </div>
          </section>

          <section className="panel">
            <h3>尺寸图例(统一)</h3>
            <label className="field">
              线宽
              <input
                type="number" step="0.5" min="0.5" value={dimStyle.strokeWidth}
                onChange={(e) => setDimStyle((s) => ({ ...s, strokeWidth: parseFloat(e.target.value) || 1.5 }))}
              />
            </label>
            <label className="field">
              箭头
              <input
                type="number" step="1" min="4" value={dimStyle.arrowSize}
                onChange={(e) => setDimStyle((s) => ({ ...s, arrowSize: parseFloat(e.target.value) || 9 }))}
              />
            </label>
            <label className="field">
              字高
              <input
                type="number" step="1" min="8" value={dimStyle.fontSize}
                onChange={(e) => setDimStyle((s) => ({ ...s, fontSize: parseFloat(e.target.value) || 14 }))}
              />
            </label>
          </section>
        </aside>
      </div>
    </div>
  );
}
