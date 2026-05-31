import packageJson from '../../package.json';

export class ServerConfig {
    static readonly VERSION: string = packageJson.version;
    static readonly DEV_MODE: boolean = process.env.DEV ? true : false;
    static readonly PORT: number = Number(process.env.PORT) || 3000;
}
