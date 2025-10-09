import { Queue, Worker, QueueEvents, } from "bullmq";
const getRedisConfig = () => {
    return process.env.REDIS_CONFIG_URL || "redis://localhost:6379/1";
};
export class QueueManager {
    _connection;
    static _instance;
    _qMap;
    _wMap;
    constructor() {
        this._connection = { url: getRedisConfig() };
        this._qMap = new Map();
        this._wMap = new Map();
    }
    get connection() {
        return this._connection;
    }
    get queueOpt() {
        return { connection: this.connection };
    }
    delayMinutesOpt(minutes) {
        const ttlMs = minutes * 60 * 1000;
        const opt = {
            connection: this.connection,
            defaultJobOptions: {
                delay: ttlMs, // e.g. 7 days = 7 * 24 * 60 * 60 * 1000
                removeOnComplete: true,
                removeOnFail: true,
            },
        };
        return opt;
    }
    delayDaysOpt(days) {
        const ttlMs = days * 24 * 60 * 60 * 1000;
        const opt = {
            connection: this.connection,
            defaultJobOptions: {
                delay: ttlMs, // e.g. 7 days = 7 * 24 * 60 * 60 * 1000
                removeOnComplete: true,
                removeOnFail: true,
            },
        };
        return opt;
    }
    get workerOption() {
        const opt = {
            connection: this._connection,
            removeOnFail: { count: 500, age: 3600 },
            removeOnComplete: { count: 500, age: 3600 },
        };
        return opt;
    }
    static get get() {
        if (!this._instance) {
            this._instance = new QueueManager();
        }
        return this._instance;
    }
    add(name, JOpt = {}) {
        if (!this._qMap.has(name)) {
            throw new Error("This queue hasn't been initialize");
        }
        return this._qMap.get(name).add(name, JOpt);
    }
    queue(name, opt = { connection: this._connection }) {
        if (!opt.connection) {
            opt.connection = this._connection;
        }
        const q = new Queue(name, opt);
        this._qMap.set(name, q);
        return q;
    }
    qEvents(name, opt = { connection: this._connection }) {
        if (!opt.connection) {
            opt.connection = this._connection;
        }
        if (!this._qMap.has(name)) {
            this.queue(name);
        }
        return new QueueEvents(name, opt);
    }
    worker(name, cb, opt = this.workerOption) {
        if (!opt.connection) {
            opt.connection = this._connection;
        }
        if (!this._qMap.has(name)) {
            this.queue(name);
        }
        const w = new Worker(name, cb, opt);
        this._wMap.set(name, w);
        return w;
    }
}
