'use client';

import { useState } from 'react';
import { useBoard } from '../context';

const PRESET_COLORS = [
  { name: 'Red', color: '#ef4444' },
  { name: 'Orange', color: '#f97316' },
  { name: 'Yellow', color: '#eab308' },
  { name: 'Green', color: '#22c55e' },
  { name: 'Blue', color: '#3b82f6' },
  { name: 'Purple', color: '#8b5cf6' },
  { name: 'Pink', color: '#ec4899' },
  { name: 'Gray', color: '#6b7280' },
];

interface LabelPickerProps {
  cardId: number;
  existingLabels: { id: number; name: string; color: string }[];
}

export function LabelPicker({ cardId, existingLabels }: LabelPickerProps) {
  const { addLabel, removeLabel, isAgent, setError } = useBoard();
  const [customName, setCustomName] = useState('');
  const [customColor, setCustomColor] = useState('#3b82f6');

  const handleAdd = async (name: string, color: string) => {
    try {
      await addLabel(cardId, name, color);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleRemove = async (labelId: number) => {
    try {
      await removeLabel(cardId, labelId);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleCustomAdd = () => {
    const name = customName.trim();
    if (!name) return;
    handleAdd(name, customColor);
    setCustomName('');
  };

  return (
    <div className="label-picker">
      {/* Existing labels */}
      <div className="label-picker-existing">
        {existingLabels.map((label) => (
          <span
            key={label.id}
            className="label-chip"
            style={{ background: label.color }}
          >
            {label.name}
            <button
              className="label-chip-remove"
              onClick={() => handleRemove(label.id)}
              aria-label={`Remove label ${label.name}`}
            >
              &times;
            </button>
          </span>
        ))}
      </div>

      {/* Preset quick-add */}
      <div className="label-picker-presets">
        <span className="label-picker-label">Add label:</span>
        {PRESET_COLORS.map((preset) => (
          <button
            key={preset.color}
            className="label-preset-btn"
            style={{ background: preset.color }}
            onClick={() => handleAdd(preset.name, preset.color)}
            aria-label={`Add ${preset.name} label`}
            title={preset.name}
          />
        ))}
      </div>

      {/* Custom label */}
      <div className="label-picker-custom">
        <div className="inline-form-row" style={{ flex: 1 }}>
          <input
            type="text"
            placeholder="Custom label..."
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            aria-label="Custom label name"
            style={{ minHeight: '28px', fontSize: '12px', flex: 1 }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCustomAdd(); }}
          />
          <input
            type="color"
            value={customColor}
            onChange={(e) => setCustomColor(e.target.value)}
            aria-label="Custom label color"
            style={{ width: '32px', height: '28px', padding: '2px', minHeight: '28px' }}
          />
          <button className="btn btn-sm" onClick={handleCustomAdd} aria-label="Add custom label">
            Add
          </button>
        </div>
      </div>

      {/* Agent mode: show labels as selectable options */}
      {isAgent && (
        <div className="label-picker-agent" style={{ marginTop: '6px' }}>
          <label>Preset labels (click to add):</label>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
            {PRESET_COLORS.map((preset) => (
              <button
                key={preset.color}
                className="btn btn-sm"
                onClick={() => handleAdd(preset.name, preset.color)}
                aria-label={`Add ${preset.name} label`}
                style={{ background: preset.color, color: '#fff', border: 'none', fontSize: '11px' }}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export { PRESET_COLORS };