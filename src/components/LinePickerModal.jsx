// 剖面线选择弹窗：左平面地质图、右伪三维斜切
import { useState } from 'react';
import PlanPicker from './PlanPicker.jsx';
import ReliefPicker from './ReliefPicker.jsx';

export default function LinePickerModal({ open, onClose, activeLineId, dispatch, onEditMeasuredLine }) {
  const [tab, setTab] = useState('plan');
  if (!open) return null;

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>选择剖面线</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-tabs">
          <button className={tab === 'plan' ? 'active' : ''} onClick={() => setTab('plan')}>
            地质图实测位置
          </button>
          <button className={tab === '3d' ? 'active' : ''} onClick={() => setTab('3d')}>
            三维模型斜拉
          </button>
        </div>
        <div className="modal-body">
          {tab === 'plan' && (
            <PlanPicker
              activeLineId={activeLineId}
              onPick={(id) => {
                dispatch({ type: 'SET_ACTIVE_LINE', lineId: id });
                onClose();
              }}
              onEditLine={onEditMeasuredLine}
            />
          )}
          {tab === '3d' && (
            <ReliefPicker
              onCreateOblique={(points) => {
                dispatch({ type: 'ADD_OBLIQUE_LINE', points });
                onClose();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
