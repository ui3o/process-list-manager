class ServicesStateClass {

    SERVICE_STATE = {
        READY: { state: "SERVICE_STATE_READY", pos: 0 },
        UP: { state: "SERVICE_STATE_UP", pos: 1 },
        DOWN: { state: "SERVICE_STATE_DOWN", pos: 2 }
    };

    constructor() {
        this.services = {};
    }

    init(serviceName) {
        return this.services[serviceName] = { ...this.SERVICE_STATE.READY };
    }

    setReadyState(serviceName) {
        this.services[serviceName] = { ...this.SERVICE_STATE.READY };
    }

    setUpState(serviceName) {
        this.services[serviceName] = { ...this.SERVICE_STATE.UP };
    }

    setDownState(serviceName) {
        this.services[serviceName] = { ...this.SERVICE_STATE.DOWN };
    }

    isDownState(serviceName) {
        return this.services[serviceName].state === this.SERVICE_STATE.DOWN.state;
    }

}

module.exports.ServicesStates = new ServicesStateClass();
