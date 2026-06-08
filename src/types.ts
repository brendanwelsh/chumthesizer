/** A single point of contact from any surface (mouse, touch, pen, trackpad). */
export interface Contact {
  /** stable id for the lifetime of the touch */
  id: string;
  /** 0..1, left → right */
  x: number;
  /** 0..1, top → bottom (0 = top of the pad) */
  y: number;
  /** 0..1 force; 1 = hard press */
  pressure: number;
}

/** Decoded per-finger data straight off the Magic Trackpad 2 raw HID frame. */
export interface RawFinger {
  id: number;
  /** normalized 0..1 */
  x: number;
  y: number;
  /** 0..1 (raw byte / 255) */
  pressure: number;
  down: boolean;
}

export type DialEvent =
  | { type: "rotate"; delta: number }
  | { type: "down" }
  | { type: "up" };

/** Where any playing surface (pad, touch, trackpad) sends its contacts. */
export interface SurfaceSink {
  start(c: Contact): void;
  move(c: Contact): void;
  end(id: string): void;
}

export interface DeviceStatus {
  connected: boolean;
  label: string;
}
export type StatusCb = (s: DeviceStatus) => void;
