
var bear = (function(bear) {

    var SoundMeter = bear.SoundMeter = function (context, traceCb) {
        this.initialize(context, traceCb);
    };

    var logger = console;

// Meter class that generates a number correlated to audio volume.
// The meter class itself displays nothing, but it makes the
// instantaneous and time-decaying volumes available for inspection.
// It also reports on the fraction of samples that were at or near
// the top of the measurement range.

    SoundMeter.prototype.initialize = function(context, traceCb) {
        if (traceCb && typeof traceCb.log === 'function'
            && typeof traceCb.error === 'function'
            && typeof  traceCb.warn === 'function'
            && typeof traceCb.info === 'function') {
            logger = traceCb;
        } else {
            logger = console;
        }

        logger.log("New SoundMeter");
        this.context = context;

        this.instant = 0.0;
        this.slow = 0.0;
        this.clip = 0.0;

        this.script = context.createScriptProcessor(2048, 1, 1);

        var that = this;
        this.script.onaudioprocess = function (event) {
            logger.log("onaudioprocess", event);
            var input = event.inputBuffer.getChannelData(0);
            logger.log("onaudioprocess: input.length=", input.length);
            var i;
            var sum = 0.0;
            var clipcount = 0;
            for (i = 0; i < input.length; ++i) { //length will be 2048
                logger.log("onaudioprocess: input[",i,"]=", input[i]);
                sum += input[i] * input[i];
                if (Math.abs(input[i]) > 0.99) {
                    clipcount += 1;
                }
            }
            that.instant = Math.sqrt(sum / input.length);
            that.slow = 0.95 * that.slow + 0.05 * that.instant;
            that.clip = clipcount / input.length;
        };
    }

    SoundMeter.prototype.connectToSource = function (stream) {
        logger.log('SoundMeter connecting');
        this.mic = this.context.createMediaStreamSource(stream);
        this.mic.connect(this.script);
        // necessary to make sample run, but should not be.
        this.script.connect(this.context.destination);
    };

    SoundMeter.prototype.stop = function () {
        logger.log("SoundMeter stop");
        this.mic.disconnect();
        this.script.disconnect();
    };

    return bear;
}(bear || {}));
