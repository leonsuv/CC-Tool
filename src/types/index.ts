// Common types used throughout the app

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}

export interface NavigationProps {
  navigation: any;
  route: any;
}

// Theme types
export type Theme = 'light' | 'dark' | 'system';

export interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  isDark: boolean;
}

// Printer types
export type ConnectionStatus =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'error'
  | 'timeout';

export interface CurrentFanSpeed {
  ModelFan: number;
  AuxiliaryFan: number;
  BoxFan: number;
}

export interface LightStatus {
  SecondLight: number;
  RgbLight: [number, number, number];
}

export interface PrintInfo {
  Status: number;
  CurrentLayer: number;
  TotalLayer: number;
  CurrentTicks: number;
  TotalTicks: number;
  Filename: string;
  TaskId: string;
  PrintSpeedPct: number;
  Progress: number;
}

export type PrintStatus =
  | 'idle'
  | 'completed'
  | 'preparing'
  | 'printing'
  | 'paused'
  | 'stopped'
  | 'unknown';

export const getPrintStatus = (status: number): PrintStatus => {
  switch (status) {
    case 0:
      return 'idle';
    case 6:
      return 'paused';
    case 8:
      return 'stopped';
    case 9:
      return 'completed';
    case 1:
    case 5:
    case 10:
    case 11:
    case 12:
    case 15:
    case 16:
    case 17:
    case 18:
    case 19:
    case 20:
      return 'preparing';
    case 13:
      return 'printing';
    default:
      return 'unknown';
  }
};

export const isPausable = (status: number): boolean => {
  // Can pause when printing
  return status === 13;
};

export const isResumable = (status: number): boolean => {
  return status === 6;
};

export const isStoppable = (status: number): boolean => {
  // Can stop when printing, preparing, or paused
  return [1, 5, 6, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22].includes(
    status
  );
};

export interface DeviceAttributes {
  [key: string]: unknown;
}

export interface PrinterFile {
  name: string;
  path: string;
  size?: number;
  directory?: boolean;
  layers?: number;
  duration?: number;
  createdAt?: number;
  thumbnail?: string;
  raw?: unknown;
}

export interface PrintTask {
  id: string;
  name: string;
  path: string;
  status: string;
  startedAt?: number;
  duration?: number;
  layers?: number;
  printedLayers?: number;
  thumbnail?: string;
  videoStatus: number;
  videoPath?: string;
  filament?: string;
}

export interface PrinterStatus {
  CurrentStatus: number[];
  TimeLapseStatus: number;
  PlatFormType: number;
  TempOfHotbed: number;
  TempOfNozzle: number;
  TempOfBox: number;
  TempTargetHotbed: number;
  TempTargetNozzle: number;
  TempTargetBox: number;
  CurrenCoord: string;
  CurrentFanSpeed: CurrentFanSpeed;
  ZOffset: number;
  LightStatus: LightStatus;
  PrintInfo: PrintInfo;
}

export interface Printer {
  id: string;
  printerName: string;
  ipAddress: string;
  connectionStatus: ConnectionStatus;
  status?: PrinterStatus;
  lastUpdate?: number; // Timestamp of last status update
  videoUrl?: string; // Video stream URL
  deviceAttributes?: DeviceAttributes;
  files?: PrinterFile[];
  printHistory?: unknown[];
  printHistoryDetails?: unknown[];
  history?: PrintTask[];
  mainboardId?: string;
  lastCommandError?: string;
}
