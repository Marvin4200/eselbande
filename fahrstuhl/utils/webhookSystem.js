/**
 * Webhook System - External event notifications
 */

class WebhookSystem {
    constructor(config = {}) {
        this.webhooks = new Map(); // webhookId -> { url, events, secret, active }
        this.eventQueue = [];
        this.deliveryStats = new Map(); // webhookId -> { delivered, failed, retries }
        this.maxRetries = config.maxRetries || 3;
        this.retryDelay = config.retryDelay || 5000;
    }

    /**
     * Register a webhook
     * @param {string} webhookId - Unique webhook ID
     * @param {string} url - Webhook URL
     * @param {Array<string>} events - Events to subscribe to
     * @param {string} secret - Secret for signature verification
     */
    registerWebhook(webhookId, url, events, secret) {
        this.webhooks.set(webhookId, {
            url,
            events,
            secret,
            active: true,
            createdAt: Date.now()
        });

        this.deliveryStats.set(webhookId, {
            delivered: 0,
            failed: 0,
            retries: 0
        });
    }

    /**
     * Unregister a webhook
     * @param {string} webhookId - Webhook ID
     */
    unregisterWebhook(webhookId) {
        this.webhooks.delete(webhookId);
        this.deliveryStats.delete(webhookId);
    }

    /**
     * Trigger an event
     * @param {string} eventName - Event name
     * @param {Object} data - Event data
     */
    triggerEvent(eventName, data) {
        const event = {
            id: `${Date.now()}-${Math.random()}`,
            name: eventName,
            data,
            timestamp: new Date().toISOString(),
            retries: 0
        };

        this.eventQueue.push(event);
        this.processQueue();
    }

    /**
     * Process event queue
     */
    async processQueue() {
        while (this.eventQueue.length > 0) {
            const event = this.eventQueue[0];

            let delivered = false;
            for (const [webhookId, webhook] of this.webhooks) {
                if (webhook.active && webhook.events.includes(event.name)) {
                    const success = await this.deliverEvent(webhookId, webhook, event);
                    if (success) {
                        delivered = true;
                    }
                }
            }

            // Remove from queue if delivered or too many retries
            if (delivered || event.retries >= this.maxRetries) {
                this.eventQueue.shift();
            } else {
                event.retries++;
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
            }
        }
    }

    /**
     * Deliver event to webhook
     * @param {string} webhookId - Webhook ID
     * @param {Object} webhook - Webhook config
     * @param {Object} event - Event data
     * @returns {Promise<boolean>}
     */
    async deliverEvent(webhookId, webhook, event) {
        try {
            const payload = JSON.stringify(event);
            const signature = this.generateSignature(payload, webhook.secret);

            const response = await fetch(webhook.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Webhook-Signature': signature,
                    'X-Webhook-Id': webhookId
                },
                body: payload,
                timeout: 10000
            });

            if (response.ok) {
                const stats = this.deliveryStats.get(webhookId);
                stats.delivered++;
                return true;
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            const stats = this.deliveryStats.get(webhookId);
            stats.failed++;
            console.error(`Webhook delivery failed for ${webhookId}:`, error.message);
            return false;
        }
    }

    /**
     * Generate HMAC signature
     * @param {string} payload - Event payload
     * @param {string} secret - Secret key
     * @returns {string}
     */
    generateSignature(payload, secret) {
        const crypto = require('crypto');
        return crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex');
    }

    /**
     * Verify webhook signature
     * @param {string} payload - Event payload
     * @param {string} signature - Signature to verify
     * @param {string} webhookId - Webhook ID
     * @returns {boolean}
     */
    verifySignature(payload, signature, webhookId) {
        const webhook = this.webhooks.get(webhookId);
        if (!webhook) return false;

        const expected = this.generateSignature(payload, webhook.secret);
        return expected === signature;
    }

    /**
     * Get webhook stats
     * @param {string} webhookId - Webhook ID
     * @returns {Object}
     */
    getWebhookStats(webhookId) {
        const webhook = this.webhooks.get(webhookId);
        const stats = this.deliveryStats.get(webhookId);

        if (!webhook) return null;

        return {
            webhookId,
            url: webhook.url,
            events: webhook.events,
            active: webhook.active,
            createdAt: new Date(webhook.createdAt),
            stats: {
                ...stats,
                successRate: stats.delivered + stats.failed > 0 
                    ? ((stats.delivered / (stats.delivered + stats.failed)) * 100).toFixed(2) + '%'
                    : 'N/A'
            }
        };
    }

    /**
     * Get all webhooks
     * @returns {Array<Object>}
     */
    getAllWebhooks() {
        const webhooks = [];
        for (const [webhookId] of this.webhooks) {
            webhooks.push(this.getWebhookStats(webhookId));
        }
        return webhooks;
    }

    /**
     * Toggle webhook active status
     * @param {string} webhookId - Webhook ID
     */
    toggleWebhook(webhookId) {
        const webhook = this.webhooks.get(webhookId);
        if (webhook) {
            webhook.active = !webhook.active;
        }
    }

    /**
     * Get queue stats
     * @returns {Object}
     */
    getQueueStats() {
        return {
            queued: this.eventQueue.length,
            totalDelivered: Array.from(this.deliveryStats.values())
                .reduce((sum, s) => sum + s.delivered, 0),
            totalFailed: Array.from(this.deliveryStats.values())
                .reduce((sum, s) => sum + s.failed, 0)
        };
    }
}

module.exports = WebhookSystem;
