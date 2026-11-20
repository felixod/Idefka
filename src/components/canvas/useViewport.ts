import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Pt } from '../../model/types';
import { SHEET_H, SHEET_W } from '../../model/sheet';
import { clamp } from '../../model/ops';
import { getState, setState } from '../../store';

export interface View {
  x: number;
  y: number;
  z: number;
}

export const canvasApi = {
  fit: () => {},
  zoomBy: (_factor: number) => {},
  setZoom: (_zoom: number) => {},
};

const DOCK_WIDTH = 70;
const FIT_PADDING = 28;

export function useViewport(wrapRef: { current: HTMLDivElement | null }, diagramId: string) {
  const [view, setViewState] = useState<View>({ x: 0, y: 0, z: 1 });
  const viewRef = useRef(view);

  const setView = (next: View) => {
    viewRef.current = next;
    setViewState(next);
    if (Math.abs(getState().zoom - next.z) > 0.001) setState({ zoom: next.z });
  };

  const fit = () => {
    const element = wrapRef.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    const z = clamp(Math.min((width - DOCK_WIDTH - FIT_PADDING * 2) / SHEET_W, (height - FIT_PADDING * 2) / SHEET_H), 0.15, 4);
    setView({ z, x: DOCK_WIDTH + (width - DOCK_WIDTH - SHEET_W * z) / 2, y: (height - SHEET_H * z) / 2 });
  };

  const zoomAt = (factor: number, cx: number, cy: number) => {
    const current = viewRef.current;
    const z = clamp(current.z * factor, 0.15, 6);
    setView({ z, x: cx - ((cx - current.x) * z) / current.z, y: cy - ((cy - current.y) * z) / current.z });
  };

  canvasApi.fit = fit;
  canvasApi.zoomBy = (factor) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) zoomAt(factor, rect.width / 2, rect.height / 2);
  };
  canvasApi.setZoom = (zoom) => canvasApi.zoomBy(zoom / viewRef.current.z);

  useLayoutEffect(fit, [diagramId]);

  useEffect(() => {
    const element = wrapRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const current = viewRef.current;
      const dx = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX;
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      if (e.ctrlKey) {
        // Ctrl+колесо или щипок трекпада — масштаб вокруг курсора
        const rect = element.getBoundingClientRect();
        zoomAt(Math.exp(-dy * 0.01), e.clientX - rect.left, e.clientY - rect.top);
        return;
      }
      // колесо — прокрутка листа; Shift+колесо — горизонталь
      if (e.shiftKey && !dx) {
        setView({ ...current, x: current.x - dy });
        return;
      }
      setView({ ...current, x: current.x - dx, y: current.y - dy });
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  const toWorld = (clientX: number, clientY: number): Pt => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const { x, y, z } = viewRef.current;
    return { x: (clientX - rect.left - x) / z, y: (clientY - rect.top - y) / z };
  };

  return { view, viewRef, setView, toWorld };
}

function isTyping(e: KeyboardEvent) {
  const target = e.target as HTMLElement;
  return target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
}

export function useSpaceHeld() {
  const [held, setHeld] = useState(false);
  const heldRef = useRef(false);

  useEffect(() => {
    const update = (value: boolean) => {
      heldRef.current = value;
      setHeld(value);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isTyping(e)) return;
      update(true);
      e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') update(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  return [held, heldRef] as const;
}
