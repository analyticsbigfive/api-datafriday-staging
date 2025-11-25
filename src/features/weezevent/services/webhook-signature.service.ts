import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class WebhookSignatureService {
    /**
     * Validate webhook signature using HMAC SHA256
     * @param payload - The webhook payload
     * @param signature - The signature from X-Weezevent-Signature header
     * @param secret - The webhook secret configured for the tenant
     * @returns true if signature is valid, false otherwise
     */
    validateSignature(
        payload: any,
        signature: string,
        secret: string,
    ): boolean {
        if (!signature || !secret) {
            return false;
        }

        try {
            // Compute HMAC SHA256 of the payload
            const payloadString = JSON.stringify(payload);
            const computed = crypto
                .createHmac('sha256', secret)
                .update(payloadString)
                .digest('hex');

            // Use timing-safe comparison to prevent timing attacks
            return crypto.timingSafeEqual(
                Buffer.from(signature),
                Buffer.from(computed),
            );
        } catch (error) {
            // Invalid signature format or comparison error
            return false;
        }
    }

    /**
     * Generate a signature for testing purposes
     * @param payload - The webhook payload
     * @param secret - The webhook secret
     * @returns HMAC SHA256 signature
     */
    generateSignature(payload: any, secret: string): string {
        const payloadString = JSON.stringify(payload);
        return crypto
            .createHmac('sha256', secret)
            .update(payloadString)
            .digest('hex');
    }
}
