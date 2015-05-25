/**
 * @Copyright 2015 Cisco Systems Inc. All rights reserved.
 *
 * @author Rain Zhao
 * @version 1.0
 * @date Mar. 26, 2015
 *
 * ROAP protocol implementation in CMSC, mostly standard but with a few extensions,
 * refer: http://wikicentral.cisco.com/display/PAN/Roap+protocol
 */

var bear = (function (bear) {

    /**
     * Every RTCPeerConnection will be corresponding with an Roap instance, every Roap instance will maintain
     * a state machine inside, refer http://wikicentral.cisco.com/display/PAN/Roap+state+machine
     *
     * receiver side: new -> offer-received -> answer-sent -> established
     * initiator side: new -> offer-sent -> answer-received -> established
     *
     * Please call initialize() after Roap instance is created.
     */
    var Roap = bear.Roap = function () {};

    ////////////////////////////////////////////////// App only need call these static methods
    var sendMsgCb, sendUpdCb, logger = console;
    var token;
    var roapObjMap = {}; //{offerId:roapObj}

    /**
     * init the callback functions, it need be called before all other calls
     * @param sendMessageToRemoteCb {function} send message to remote side: function(msgstring) {}
     * @param sendUpdateToLocalCb {function} local app will get updates from this callback: function(msgObj) {}
     * @param traceCb {function} trace function
     */
    Roap.init = function(sendMessageToRemoteCb, sendUpdateToLocalCb, traceCb) {
        sendMsgCb = sendMessageToRemoteCb;
        sendUpdCb = sendUpdateToLocalCb;
        if (traceCb && typeof traceCb.log === 'function'
            && typeof traceCb.error === 'function'
            && typeof  traceCb.warn === 'function'
            && typeof traceCb.info === 'function') {
            logger = traceCb;
        } else {
            logger = console;
        }
    };

    /**
     * the app can set token, this token will be included in ROAP messages to peer side
     * @param sessionToken
     */
    Roap.setSessionToken = function(sessionToken) {
        token = sessionToken;
    };

    Roap.RoapSuccessResult = function(offerId, roapObj) {
        this.bSuccess = true;
        this.offerId = offerId;
        this.roapObj = roapObj;
    }
    Roap.RoapFailResult = function(failReason) {
        this.bSuccess = false;
        this.failReason = failReason;
    }

    /**
     * When got remote signaling messages, call this method to handle it
     * @param msgstring {string} the signaling message from remote side
     */
    Roap.onRemoteMessage = function (msgstring) {
        //logger.log('Got message from server');

        var msg;
        try{
            msg = Roap.parseMsg(msgstring);
        }
        catch (e){
            //ignore it if msgstring is not a valid json string
            logger.error("Not a valid json string, ignore this incoming message, error:", e);
            return new Roap.RoapFailResult('Not a valid json string: ' + e.toString());
        }

        var roap = roapObjMap[msg.offererSessionId];
        if (!roap){
            //not found the roap obj, need create new Roap
            if (msg.messageType.toUpperCase() !== 'OFFER') {
                logger.error('OFFER must be the first message, ignore this incoming message.');
                return new Roap.RoapFailResult('OFFER must be the first message');
            }
            roap = new Roap();
            var sendMessageCb = sendMsgCb.bind(roap);
            var sendUpdateCb = sendUpdCb.bind(roap);
            roap.initialize(sendMessageCb, sendUpdateCb, logger);

            //cache roap obj
            roapObjMap[msg.offererSessionId] = roap;
        }

        return roap.onMessageFromRemote(msg);
    };

    /**
     * local app can call this method to set offer/answer/ok/info/etc
     * @param offerId {string} the offer id, this is the global unique key that can identify a ROAP object
     * @param msg {object} the message object
     * @returns {string} offererSessionId, the app need cache it if this is new created roap object
     */
    Roap.onLocalMessage = function (offerId, msg) {
        //logger.log('type:', msg.type);

        if (offerId) {
            var roap = roapObjMap[offerId];
            if (roap){
                return roap.onUpdateFromLocal(msg);
            }
            else {
                console.error("not found Roap with offerId:", offerId);
                return new Roap.RoapFailResult('not found Roap with offerId:' + offerId);
            }
        }
        else {
            if (msg.type === 'offer') {
                var roap = new Roap();
                var sendMessageCb = sendMsgCb.bind(roap);
                var sendUpdateCb = sendUpdCb.bind(roap);
                roap.initialize(sendMessageCb, sendUpdateCb, logger);

                var result = roap.onUpdateFromLocal(msg);

                //cache roap obj
                if (result.bSuccess) {
                    roapObjMap[roap.offererSessionId] = roap;
                }

                return result;
            }
            else {
                console.error('offer must be first message, this call is ignored.');
                return new Roap.RoapFailResult('offer must be first message, this call is ignored.');
            }
        }
    };
    ////////////////////////////////////////////////// end of static methods

    /////////////////////////////////////////////////////////////////// utils
    Roap.getRandomInt = function (min, max) { //in range [min, max)
        return Math.floor(Math.random() * (max - min)) + min;
    };
    Roap.genSessionId = function() {
        return Roap.getRandomInt(1000, 10000) + '-' + Roap.getRandomInt(1000, 10000) + '-' + Roap.getRandomInt(1000, 10000);
    };
    //return msg.setSessionToken or msg.sessionToken
    var getMsgSessionToken = function(msg) {
        return msg.setSessionToken ? msg.setSessionToken : msg.sessionToken;
    };
    /////////////////////////////////////////////////////////////////// end of utils

    //tieBreaker range
    var MIN_TIEBREAKER = 0;
    var MAX_TIEBREAKER = 4294967295; //from ROAP rfc

    //retry timer
    var TIMER_INIT_MS = 1000;
    var TIMER_MAX_MS = 8000;

    //to generate seq
    var maxSeq = 0;

    /**
     * Parse message string into JSON object, and verify whether the message string is a valid ROAP message
     * if it is not a valid ROAP msg, an error will be threw, so the caller need try catch this method call.
     * For the ROAP message format, refer http://wikicentral.cisco.com/display/PAN/ROAP+Protocol+and+Its+Extensions+for+CMSC
     * @param msgstring {string} the roap message string
     * @return json object of the msg
     * @throw error if it is not a valid roap message
     */
    Roap.parseMsg = function(msgstring){
        var msg = JSON.parse(msgstring);

        //verify messageType
        var msgType = msg.messageType;
        if (!msgType) {
            throw new Error("messageType is not found");
        }
        msgType = msgType.toUpperCase();

        switch (msgType){
            case 'OFFER':
            case 'ANSWER':
                //verify sdp
                if (!msg.sdp) {
                    throw new Error("sdp is required in OFFER and ANSWER messages");
                }

                //verify sessionToken
                if (!msg.setSessionToken && !msg.sessionToken) {
                    throw new Error("sessionToken or setSessionToken is required in OFFER and ANSWER messages");
                }
            case 'OK':
            case 'ERROR':
            case 'INFO':
            case 'ICECANDIDATE':
            case 'SHUTDOWN':
            case 'SUBSCRIBE':
                //verify offerSessionId
                if (!msg.offererSessionId) {
                    throw new Error("offererSessionId is not found");
                }

                //verify seq
                if (!msg.seq) {
                    throw new Error("seq is not found");
                }
                break;
            default:
                throw new Error("Unsupported messageType: " + msg.messageType);
        }

        return msg;
    };

    Roap.prototype.initialize = function(sendMessageToRemoteCb, sendUpdateToLocalCb) {
        this.sendMessageToRemoteCb = sendMessageToRemoteCb;
        this.sendUpdateToLocalCb = sendUpdateToLocalCb;

        //init the variables
        this.state = 'new';
        this.timeout = 0;
        this.incomingMsg = null;

        this.offererSessionId = null;
        this.answererSessionId = null;
        this.seq = 0;
        this.sessionToken = null;
        this.offerSdp = null;
        this.answerSdp = null;
    };

    // when got message from remote side, call this method
    // msg is a JSON object, should be parsed by method Roap.parseMsg()
    Roap.prototype.onMessageFromRemote = function (msg) {
        var msgType = msg.messageType;
        //logger.log('current state:', this.state, 'messageType:', msgType);
        this.incomingMsg = msg;

        (maxSeq < msg.seq) && (maxSeq = msg.seq); //increase maxSeq if it is lower than seq

        switch (msgType.toUpperCase()) {
            case 'OFFER':
                return this._onOffer(msg);
                break;
            case 'ANSWER':
                return this._onAnswer(msg);
                break;
            case 'OK':
                var okType = msg.okType;
                if (!okType) { //no okType, default to offer/answer/ok
                    return this._onOkOffer(msg);
                } else if (okType === 'INFO') {
                    return this._onOkInfo(msg);
                } else if (okType === 'SUBSCRIBE') {
                    return this._onOkSubscribe(msg);
                } else {
                    console.error('unknown ok type:', okType);
                    return new Roap.RoapFailResult('unknown ok type: ' + okType);
                }
                break;
            case 'INFO':
                return this._onInfo(msg);
                break;
            case 'ICECANDIDATE':
                return this._onIceCandidate(msg);
                break;
            case 'ERROR':
                return this._onError(msg);
                break;
            case 'SHUTDOWN':
                return this._onShutdown(msg);
                break;
            case 'SUBSCRIBE':
                //TODO: need handle SUBSCRIBE from remote side
                return new Roap.RoapFailResult('SUBSCRIBE is not handled');
                break;
            default:
                logger.error("why come here? unknown messageType: " + msgType);
                return new Roap.RoapFailResult('unknown messageType: ' + msgType);
        }
    };

    /**
     * local app call this method to set offer, answer, ice candidate, etc.
     * @param msg {object} internal message format is defined in wiki
     */
    Roap.prototype.onUpdateFromLocal = function (msg) {
        var type = msg.type;
        if (!type){
            logger.error("onMessageFromLocal: not found type property");
            return new Roap.RoapFailResult('not found type property');
        }
        //logger.log("msg type:", type);
        switch (type.toUpperCase()) {
            case 'OFFER':
                this._setOffer(msg.sdp);
                break;
            case 'ANSWER':
                this._setAnswer(msg.sdp);
                break;
            case 'ICECANDIDATE':
                this._sendIceCandidate(msg.sdpMid, msg.sdpMLineIndex, msg.candidate);
                break;
            case 'INFO':
                this._setInfo(msg.infoType, msg.value);
                break;
            case 'ERROR':
                this._sendError(this.offererSessionId, this.answererSessionId, this.seq, this.sessionToken, msg.errorType, msg.errorMsg);
                break;
            case 'SHUTDOWN':
                this._setShutdown();
                break;
            case 'SUBSCRIBE':
                //TODO: need handle SUBSCRIBE from local side
                return new Roap.RoapFailResult('not handled');
                break;
            default:
                logger.error('unknown message type: ' + msg.messageType);
                return new Roap.RoapFailResult('unknown type: ' + msg.type);
        }
        return new Roap.RoapSuccessResult(this.offererSessionId, this);
    };

    Roap.prototype._setOffer = function(sdp) {
        //logger.log('offer', sdp);

        this.offererSessionId || (this.offererSessionId = Roap.genSessionId());
        this.seq = ++ maxSeq;
        this.offerSdp = sdp;

        this._sendMessage('OFFER', sdp);
        this.changeState('offer-sent');

        //set timer
        this.initTimeout();
    }

    Roap.prototype.initTimeout = function () {
        this.timeout = TIMER_INIT_MS; //init 1 seconds, double next time
        var that = this;
        this.timerId = setTimeout(function () {
            that.retryOfferAnswer();
        }, this.timeout);
        logger.log('set timer:', this.timeout);
    };

    Roap.prototype.retryOfferAnswer = function() {
        this.timeout = this.timeout * 2; //double the timer, 1 seconds, 2 seconds, 4 seconds, 8 seconds
        if (this.timeout > TIMER_MAX_MS) {
            //cancel the timer
            this.timeout = 0;
            this.timerId = 0;

            //notify app
            var localMsg = {type:'error', errorType:'TIMEOUT', errorMsg:'failed to send message to peer side'};
            this.sendUpdateToLocalCb(localMsg);
        } else {
            if (this.state === 'offer-sent') {
                this._sendMessage('OFFER', this.offerSdp);
            } else if (this.state === 'answer-sent') {
                this._sendMessage('ANSWER', this.answerSdp);
            } else {
                logger.warn('why there is timer in state:', this.state);
            }

            var that = this;
            this.timerId = setTimeout(function () {
                that.retryOfferAnswer();
            }, this.timeout);
            logger.log('set timer:', this.timeout);
        }
    };

    Roap.prototype._setAnswer = function(sdp) {
        //logger.log('answer:', sdp);

        this.answerSdp = sdp;

        //generate the answererSessionId if it is null
        //if answererSessionId is not null, it means retry, needn't generate a new answererSessionId
        if (!this.answererSessionId) {
            this.answererSessionId = Roap.genSessionId();
        }

        this._sendMessage('ANSWER', sdp);
        this.changeState('answer-sent');

        //set timer
        this.initTimeout();
    };

    Roap.prototype._sendIceCandidate = function (sdpMid, sdpMLineIndex, candidate) {
        var roapMessage = {};
        roapMessage.messageType = "ICECANDIDATE";
        roapMessage.offererSessionId = this.offererSessionId;
        this.answererSessionId && (roapMessage.answererSessionId = this.answererSessionId);
        roapMessage.seq = this.seq;
        this.getSessionToken() && (roapMessage.sessionToken = this.getSessionToken());
        roapMessage.sdpMid = sdpMid;
        roapMessage.sdpMLineIndex = sdpMLineIndex;
        roapMessage.candidate = candidate;
        this.sendMessageToRemoteCb(JSON.stringify(roapMessage));
    };

    Roap.prototype._setInfo = function(infoType, value) {
        var roapMessage = {};
        roapMessage.messageType = "INFO";
        roapMessage.offererSessionId = this.offererSessionId;
        this.answererSessionId && (roapMessage.answererSessionId = this.answererSessionId);
        roapMessage.seq = this.seq;
        this.getSessionToken() && (roapMessage.sessionToken = this.getSessionToken());
        roapMessage.infoType = infoType;
        roapMessage.value = value;
        this.sendMessageToRemoteCb(JSON.stringify(roapMessage));
    };

    Roap.prototype._setShutdown = function () {
        delete roapObjMap[this.offererSessionId];

        var roapMessage = {};
        roapMessage.messageType = "SHUTDOWN";
        roapMessage.offererSessionId = this.offererSessionId;
        this.answererSessionId && (roapMessage.answererSessionId = this.answererSessionId);
        roapMessage.seq = this.seq;
        this.getSessionToken() && (roapMessage.sessionToken = this.getSessionToken());
        this.sendMessageToRemoteCb(JSON.stringify(roapMessage));
    };

    Roap.prototype._onOffer = function(msg){
        //logger.log('Received offer:', msg.sdp);

        switch (this.state) {
            case 'new':
                this._cacheOfferAndNotifyApp(msg);
                break;
            case 'offer-received':
                //do same thing as 'new', notify app to generate answer sdp
                this._cacheOfferAndNotifyApp(msg);
                break;
            case 'answer-sent': //answer is not received by peer side?
                //resend cached answer sdp
                this._sendMessage('ANSWER', this.answerSdp);
                break;
            case 'offer-sent':
            case 'answer-received':
                console.error('should not receive offer in state', this.state, ', respond error');
                this._sendError(msg.offererSessionId, null, msg.seq, getMsgSessionToken(msg), 'CONFLICT', 'received offer at offerer side');
                return new Roap.RoapFailResult('received offer in state ' + this.state);
                break;
            case 'established':
                this._cacheOfferAndNotifyApp(msg);
                break;
            default:
                console.error('unknown state:', this.state);
                return new Roap.RoapFailResult('unknown state ' + this.state);
        }
        return new Roap.RoapSuccessResult(this.offererSessionId, this);
    };

    Roap.prototype._cacheOfferAndNotifyApp = function(msg) {
        this.changeState('offer-received');

        this.offererSessionId = msg.offererSessionId;
        this.seq = msg.seq;
        this.sessionToken = getMsgSessionToken(msg);
        this.offerSdp = msg.sdp;

        //notify app
        var localMsg = {type:'offer', sdp:this.offerSdp};
        this.sendUpdateToLocalCb(localMsg);
    };

    Roap.prototype._cacheAnswerAndNotifyApp = function(msg) {
        this.changeState('answer-received');

        this.answererSessionId = msg.answererSessionId;
        this.answerSdp = msg.sdp;

        //notify app
        var localMsg = {type:'answer', sdp:this.answerSdp};
        this.sendUpdateToLocalCb(localMsg);
    };

    Roap.prototype._onAnswer = function(msg){
        //logger.log('Received answer:', msg.sdp);

        switch (this.state) {
            case 'new':
            case 'offer-received':
            case 'answer-sent':
            case 'established':
                console.error('why receive answer? current state:', this.state);
                this._sendError(msg.offererSessionId, msg.answererSessionId, msg.seq, getMsgSessionToken(msg), 'CONFLICT', 'received answer at wrong state: ' + this.state);
                return new Roap.RoapFailResult('received answer in state ' + this.state);
                break;
            case 'offer-sent':
            case 'answer-received':
                this._cacheAnswerAndNotifyApp(msg);

                //cancel timer if any
                if (this.timerId) {
                    clearTimeout(this.timerId);
                    this.timerId = 0;
                    this.timeout = 0;
                }

                this._sendMessage('OK'); //respond ok
                this.changeState('established');
                this._notifyDone();
                return new Roap.RoapSuccessResult(this.offererSessionId, this);
                break;
            default:
                console.error('unknown state:', this.state);
                return new Roap.RoapFailResult('unknown state ' + this.state);
        }
    };

    Roap.prototype._onOkOffer = function (msg) {
        switch (this.state) {
            case 'answer-sent':
                //cancel timer if any
                if (this.timerId) {
                    clearTimeout(this.timerId);
                    this.timerId = 0;
                    this.timeout = 0;
                }

                this.changeState('established');
                this._notifyDone();
                return new Roap.RoapSuccessResult(this.offererSessionId, this);
                break;
            case 'new':
            case 'offer-received':
            case 'offer-sent':
            case 'answer-received':
            case 'established':
                console.error('should not receive offer in this state', this.state, ', just ignore the offer');
                this._sendError(msg.offererSessionId, null, msg.seq, getMsgSessionToken(msg), 'CONFLICT', 'received offer at offerer side');
                return new Roap.RoapFailResult('received ok(offer) in state ' + this.state);
                break;
            default:
                console.error('unknown state:', this.state);
                return new Roap.RoapFailResult('unknown state ' + this.state);
        }
    };

    Roap.prototype._onOkInfo = function (msg) {
        //TODO how to handle ok for info? remove info timer?
        return new Roap.RoapFailResult('not handled');
    };

    Roap.prototype._onOkSubscribe = function (msg) {
        //TODO how to handle ok for subscribe? remove subscribe timer?
        return new Roap.RoapFailResult('not handled');
    };

    Roap.prototype._onIceCandidate = function(msg){
        //got ice candidate from peer side
        var localMsg = {type:'icecandidate', sdpMid:msg.sdpMid, sdpMLineIndex:msg.sdpMLineIndex, candidate:msg.candidate};
        this.sendUpdateToLocalCb(localMsg);
        return new Roap.RoapSuccessResult(this.offererSessionId, this);
    };

    Roap.prototype._onInfo = function(msg){
        var localMsg = {type:'info', infoType:msg.infoType, value:msg.value};
        this.sendUpdateToLocalCb(localMsg);
        return new Roap.RoapSuccessResult(this.offererSessionId, this);
    };

    Roap.prototype._onError = function (msg) {
        //TODO: should we do retry offer/answer?
        var localMsg = {type:'error', errorType:msg.errorType, errorMsg:msg.errorMsg};
        this.sendUpdateToLocalCb(localMsg);
        return new Roap.RoapSuccessResult(this.offererSessionId, this);
    };

    Roap.prototype._onShutdown = function (msg) {
        delete roapObjMap[this.offererSessionId];

        var localMsg = {type:'shutdown'};
        this.sendUpdateToLocalCb(localMsg);
        return new Roap.RoapSuccessResult(this.offererSessionId, this);
    };

    Roap.prototype._notifyDone = function() {
        //var localMsg = {type:'done'};
        //this.sendUpdateToLocalCb(localMsg);
    };

    Roap.prototype.getSessionToken = function () {
        return this.sessionToken ? this.sessionToken : token;
    };

    //to send offer/answer/ok
    Roap.prototype._sendMessage = function (operation, sdp) {
        var roapMessage = {};
        roapMessage.messageType = operation;
        roapMessage.offererSessionId = this.offererSessionId;
        this.answererSessionId && (roapMessage.answererSessionId = this.answererSessionId);
        roapMessage.seq = this.seq;
        switch (operation.toUpperCase()) {
            case 'OFFER':
                this.getSessionToken() && (roapMessage.setSessionToken = this.getSessionToken());
                roapMessage.tiebreaker = this.tiebreaker = Roap.getRandomInt(MIN_TIEBREAKER, MAX_TIEBREAKER);
                break;
            case 'ANSWER':
                this.getSessionToken() && (roapMessage.sessionToken = this.getSessionToken());
                roapMessage.moreComing = false; // always give final answer
                break;
            default:
                ;
        }
        sdp && (roapMessage.sdp = sdp);

        //call the callback function to send the offer to peer side
        this.sendMessageToRemoteCb(JSON.stringify(roapMessage));
    };

    Roap.prototype._sendError = function (offererSessionId, answererSessionId, seq, sessionToken, errorType, errorMsg) {
        var roapMessage = {};
        roapMessage.messageType = "ERROR";
        roapMessage.offererSessionId = offererSessionId;
        answererSessionId && (roapMessage.answererSessionId = answererSessionId);
        roapMessage.seq = seq;
        roapMessage.sessionToken = sessionToken;
        roapMessage.errorType = errorType;
        errorMsg && (roapMessage.errorMsg = errorMsg);

        //call the callback function to send the error to peer side
        this.sendMessageToRemoteCb(JSON.stringify(roapMessage));
    };

    Roap.prototype.changeState = function (strNewState) {
        var oldState = this.state;
        this.state = strNewState;
        //logger.log("oldState=" + oldState + ", newState=" + strNewState);
    };

    return bear;
}(bear || {}));

if (typeof exports !== 'undefined') {
    exports.Roap = bear.Roap;
}