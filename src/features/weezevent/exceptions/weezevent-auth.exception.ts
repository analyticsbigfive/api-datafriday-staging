export class WeezeventAuthException extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'WeezeventAuthException';
    }
}
