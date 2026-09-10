/*
 * File attribution
 * edited by Christian Stelmach (chrisp.stel@gmail.com), GitHub: @cstelmach
 */
// Copyright © 2026 Michael Artner
import packageJson from '../../package.json';

export class ServerConfig {
  static readonly VERSION: string = packageJson.version;
  static readonly FRONTEND_VERSION: string = process.env.FRONTEND_VERSION || "unknown";
  static readonly DEV_MODE: boolean = ['true', '1'].includes((process.env.DEV ?? '').toLowerCase());
  static readonly PORT: number = Number(process.env.PORT) || 3000;

  private ServerConfig() { }

  static toString(): string {
    return JSON.stringify({
      version: this.VERSION,
      dev: this.DEV_MODE,
      port: this.PORT,
    });
  }
}

export class ApiConfig {
  static readonly INIT: string = "/init";
  static readonly SURVEY: string = "/survey";
  static readonly METRICS_BASE: string = "/metrics";
  static readonly METRICS_TOGGLE: string = `${this.METRICS_BASE}/toggle`;
  static readonly METRICS_STEP: string = `${this.METRICS_BASE}/surveyStep`;
  static readonly METRICS_VIZMODE: string = `${this.METRICS_BASE}/vizmode`;
}
