'use strict';

let sdcardTimer;

TABS.blackbox = {
    isDirty: false,

    blockSize: 128,
    writeError: false,

    BLOCK_SIZE: 4096,
    VCP_BLOCK_SIZE_3_0: 512,
    VCP_BLOCK_SIZE: 4096,

    DEBUG_MODES: [
        "NONE",
        "CYCLETIME",
        "BATTERY",
        "GYRO_FILTERED",
        "ACCELEROMETER",
        "PIDLOOP",
        "GYRO_SCALED",
        "RC_INTERPOLATION",
        "ANGLERATE",
        "ESC_SENSOR",
        "SCHEDULER",
        "STACK",
        "ESC_SENSOR_RPM",
        "ESC_SENSOR_TMP",
        "ALTITUDE",
        "FFT",
        "FFT_TIME",
        "FFT_FREQ",
        "RX_FRSKY_SPI",
        "RX_SFHSS_SPI",
        "GYRO_RAW",
        "DUAL_GYRO_RAW",
        "DUAL_GYRO_DIFF",
        "MAX7456_SIGNAL",
        "MAX7456_SPICLOCK",
        "SBUS",
        "FPORT",
        "RANGEFINDER",
        "RANGEFINDER_QUALITY",
        "LIDAR_TF",
        "ADC_INTERNAL",
        "GOVERNOR",
        "SDIO",
        "CURRENT_SENSOR",
        "USB",
        "SMARTAUDIO",
        "RTH",
        "ITERM_RELAX",
        "ACRO_TRAINER",
        "RC_SMOOTHING",
        "RX_SIGNAL_LOSS",
        "RC_SMOOTHING_RATE",
        "UNUSED42",
        "DYN_LPF",
        "RX_SPEKTRUM_SPI",
        "DSHOT_RPM_TELEMETRY",
        "RPM_FILTER",
        "RPM_SOURCE",
        "AC_CORRECTION",
        "AC_ERROR",
        "DUAL_GYRO_SCALED",
        "DSHOT_RPM_ERRORS",
        "CRSF_LINK_STATISTICS_UPLINK",
        "CRSF_LINK_STATISTICS_PWR",
        "CRSF_LINK_STATISTICS_DOWN",
        "BARO",
        "GPS_RESCUE_THROTTLE_PID",
        "FREQ_SENSOR",
        "FF_LIMIT",
        "FF_INTERPOLATED",
        "BLACKBOX_OUTPUT",
        "GYRO_SAMPLE",
        "RX_TIMING",
        "YAW_PRECOMP",
        "UNKNOWN1",
        "UNKNOWN2",
        "UNKNOWN3",
        "UNKNOWN4",
    ],
};

TABS.blackbox.initialize = function (callback) {
    const self = this;

    self.isDirty = false;

    let saveCancelled, eraseCancelled;

    load_data(load_html);

    function load_html() {
        $('#content').load("./tabs/blackbox.html", process_html);
    }

    function load_data(callback) {
        Promise.resolve(true)
           .then(() => MSP.promise(MSPCodes.MSP_STATUS))
           .then(() => MSP.promise(MSPCodes.MSP_NAME))
           .then(() => MSP.promise(MSPCodes.MSP_FEATURE_CONFIG))
           .then(() => MSP.promise(MSPCodes.MSP_ADVANCED_CONFIG))
           .then(() => MSP.promise(MSPCodes.MSP_DATAFLASH_SUMMARY))
           .then(() => MSP.promise(MSPCodes.MSP_SDCARD_SUMMARY))
           .then(() => MSP.promise(MSPCodes.MSP_BLACKBOX_CONFIG))
           .then(() => MSP.promise(MSPCodes.MSP_DEBUG_CONFIG))
           .then(callback);
    }

    function save_data(callback) {
        Promise.resolve(true)
            .then(() => MSP.promise(MSPCodes.MSP_SET_DEBUG_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_DEBUG_CONFIG)))
            .then(() => MSP.promise(MSPCodes.MSP_SET_BLACKBOX_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_BLACKBOX_CONFIG)))
            .then(() => MSP.promise(MSPCodes.MSP_EEPROM_WRITE))
            .then(() => {
                GUI.log(i18n.getMessage('eepromSaved'));
                MSP.send_message(MSPCodes.MSP_SET_REBOOT);
                GUI.log(i18n.getMessage('deviceRebooting'));
                reinitialiseConnection(callback);
            });
    }

    function process_html() {

        // translate to user-selected language
        i18n.localizePage();

        const dataflashPresent = (FC.DATAFLASH.totalSize > 0);

        let blackboxSupport;
        if (FC.BLACKBOX.supported || FC.DATAFLASH.supported) {
            blackboxSupport = 'yes';
        } else {
            blackboxSupport = 'no';
        }

        $(".tab-blackbox")
            .addClass("serial-supported")
            .toggleClass("dataflash-supported", FC.DATAFLASH.supported)
            .toggleClass("dataflash-present", dataflashPresent)
            .toggleClass("sdcard-supported", FC.SDCARD.supported)
            .toggleClass("blackbox-config-supported", FC.BLACKBOX.supported)
            .toggleClass("blackbox-supported", blackboxSupport === 'yes')
            .toggleClass("blackbox-maybe-supported", blackboxSupport === 'maybe')
            .toggleClass("blackbox-unsupported", blackboxSupport === 'no');

        if (dataflashPresent) {
            $('.tab-blackbox a.erase-flash').click(ask_to_erase_flash);
            $('.tab-blackbox a.erase-flash-confirm').click(flash_erase);
            $('.tab-blackbox a.erase-flash-cancel').click(flash_erase_cancel);
            $('.tab-blackbox a.save-flash').click(flash_save_begin);
            $('.tab-blackbox a.save-flash-cancel').click(flash_save_cancel);
            $('.tab-blackbox a.save-flash-dismiss').click(dismiss_saving_dialog);
        }

        const deviceSelect = $(".blackboxDevice select");
        const loggingRatesSelect = $(".blackboxRate select");
        const debugModeSelect = $(".blackboxDebugMode select");

        populateLoggingRates(loggingRatesSelect);
        populateDevices(deviceSelect);
        populateDebugModes(debugModeSelect);

        deviceSelect.change(function() {
            if ($(this).val() === "0") {
                $("div.blackboxRate").hide();
            } else {
                $("div.blackboxRate").show();
            }
        }).change();

        if ((FC.SDCARD.supported && deviceSelect.val() == 2) ||
            (FC.DATAFLASH.supported && deviceSelect.val() == 1)) {

            $(".tab-blackbox")
                .toggleClass("msc-supported", true);

            $('a.blackboxRebootMsc').click(function () {
                const buffer = [];
                // Reboot into MSC using UTC time offset instead of user timezone
                // Linux seems to expect that the FAT file system timestamps are UTC based
                if (GUI.operating_system === "Linux")
                    buffer.push(mspHelper.REBOOT_TYPES.MSC_UTC);
                else
                    buffer.push(mspHelper.REBOOT_TYPES.MSC);

                MSP.send_message(MSPCodes.MSP_SET_REBOOT, buffer, false);
            });
        }

        if (FC.BLACKBOX.supported) {

            function update_data() {
                FC.BLACKBOX.blackboxPDenom = parseInt(loggingRatesSelect.val(), 10);
                FC.BLACKBOX.blackboxDevice = parseInt(deviceSelect.val(), 10);
                FC.DEBUG_CONFIG.debugMode = parseInt(debugModeSelect.val());
            }

            self.save = function (callback) {
                update_data();
                save_data(callback);
            };

            self.revert = function (callback) {
                callback();
            };

            $(".tab-blackbox a.save-settings").click(function() {
                self.save(() => GUI.tab_switch_reload());
            });

            $('.tab-blackbox .blackbox-changes').change(function () {
                self.isDirty = true;
            });
        }

        update_html();

        GUI.content_ready(callback);
    }

    function populateDevices(deviceSelect) {
        deviceSelect.empty();
        deviceSelect.append('<option value="0">' + i18n.getMessage('blackboxLoggingNone') + '</option>');
        if (FC.DATAFLASH.supported) {
            deviceSelect.append('<option value="1">' + i18n.getMessage('blackboxLoggingFlash') + '</option>');
        }
        if (FC.SDCARD.supported) {
            deviceSelect.append('<option value="2">' + i18n.getMessage('blackboxLoggingSdCard') + '</option>');
        }
        deviceSelect.append('<option value="3">' + i18n.getMessage('blackboxLoggingSerial') + '</option>');

        deviceSelect.val(FC.BLACKBOX.blackboxDevice);
    }

    function populateLoggingRates(loggingRatesSelect) {

        const pidRate = FC.CONFIG.sampleRateHz / FC.ADVANCED_CONFIG.pid_process_denom;

        const loggingRates = [
            { text: "Disabled", hz: 0,     p_denom: 0 },
            { text: "62.5 Hz",  hz: 62.5,  p_denom: 2 },
            { text: "125 Hz",   hz: 125,   p_denom: 4 },
            { text: "250 Hz",   hz: 250,   p_denom: 8 },
            { text: "500 Hz",   hz: 500,   p_denom: 16 },
            { text: "1 kHz",    hz: 1000,  p_denom: 32 },
            { text: "1.5 kHz",  hz: 1500,  p_denom: 48 },
            { text: "2 kHz",    hz: 2000,  p_denom: 64 },
            { text: "4 kHz",    hz: 4000,  p_denom: 128 },
            { text: "8 kHz",    hz: 8000,  p_denom: 256 },
        ];

        $.each(loggingRates, function(index, item) {
            if (pidRate >= item.hz || item.hz == 0) {
                loggingRatesSelect.append(new Option(item.text, item.p_denom));
            }
        });

        loggingRatesSelect.val(FC.BLACKBOX.blackboxPDenom);
    }

    function populateDebugModes(debugModeSelect) {

        $('.blackboxDebugMode').show();

        for (let i = 0; i < FC.DEBUG_CONFIG.debugModeCount; i++) {
            if (i < self.DEBUG_MODES.length) {
                debugModeSelect.append(new Option(self.DEBUG_MODES[i], i));
            } else {
                debugModeSelect.append(new Option(i18n.getMessage('blackboxDebugModeUnknown'), i));
            }
        }

        debugModeSelect.val(FC.DEBUG_CONFIG.debugMode);

        // Convert to select2 and order alphabetic
        debugModeSelect.select2({
            sorter(data) {
                return data.sort(function(a, b) {
                    if (a.text === "NONE" || b.text === i18n.getMessage('blackboxDebugModeUnknown')) {
                        return -1;
                    } else if (b.text ==="NONE" || a.text === i18n.getMessage('blackboxDebugModeUnknown')) {
                        return 1;
                    } else {
                        return a.text.localeCompare(b.text);
                    }
                });
            },
        });
    }

    function formatFilesizeKilobytes(kilobytes) {
        if (kilobytes < 1024) {
            return Math.round(kilobytes) + "kB";
        }

        const megabytes = kilobytes / 1024;
        let gigabytes;

        if (megabytes < 900) {
            return megabytes.toFixed(1) + "MB";
        } else {
            gigabytes = megabytes / 1024;

            return gigabytes.toFixed(1) + "GB";
        }
    }

    function formatFilesizeBytes(bytes) {
        if (bytes < 1024) {
            return bytes + "B";
        }
        return formatFilesizeKilobytes(bytes / 1024);
    }

    function update_bar_width(bar, value, total, label, valuesAreKilobytes) {
        if (value > 0) {
            bar.css({
                width: (value / total * 100) + "%",
                display: 'block'
            });

            $("div", bar).text((label ? label + " " : "") + (valuesAreKilobytes ? formatFilesizeKilobytes(value) : formatFilesizeBytes(value)));
        } else {
            bar.css({
                display: 'none'
            });
        }
    }

    function update_html() {

        const dataflashPresent = FC.DATAFLASH.totalSize > 0;

        update_bar_width($(".tab-blackbox .dataflash-used"), FC.DATAFLASH.usedSize, FC.DATAFLASH.totalSize, i18n.getMessage('dataflashUsedSpace'), false);
        update_bar_width($(".tab-blackbox .dataflash-free"), FC.DATAFLASH.totalSize - FC.DATAFLASH.usedSize, FC.DATAFLASH.totalSize, i18n.getMessage('dataflashFreeSpace'), false);

        update_bar_width($(".tab-blackbox .sdcard-other"), FC.SDCARD.totalSizeKB - FC.SDCARD.freeSizeKB, FC.SDCARD.totalSizeKB, i18n.getMessage('dataflashUnavSpace'), true);
        update_bar_width($(".tab-blackbox .sdcard-free"), FC.SDCARD.freeSizeKB, FC.SDCARD.totalSizeKB, i18n.getMessage('dataflashLogsSpace'), true);

        $(".btn a.erase-flash, .btn a.save-flash").toggleClass("disabled", FC.DATAFLASH.usedSize === 0);

        $(".tab-blackbox")
            .toggleClass("sdcard-error", FC.SDCARD.state === MSP.SDCARD_STATE_FATAL)
            .toggleClass("sdcard-initializing", FC.SDCARD.state === MSP.SDCARD_STATE_CARD_INIT || FC.SDCARD.state === MSP.SDCARD_STATE_FS_INIT)
            .toggleClass("sdcard-ready", FC.SDCARD.state === MSP.SDCARD_STATE_READY);

        const mscIsReady = dataflashPresent || (FC.SDCARD.state === MSP.SDCARD_STATE_READY);
        $(".tab-blackbox")
            .toggleClass("msc-not-ready", !mscIsReady);

        if (!mscIsReady) {
            $('a.blackboxRebootMsc').addClass('disabled');
        } else {
            $('a.blackboxRebootMsc').removeClass('disabled');
        }

        let loggingStatus;
        switch (FC.SDCARD.state) {
            case MSP.SDCARD_STATE_NOT_PRESENT:
                $(".sdcard-status").text(i18n.getMessage('sdcardStatusNoCard'));
                loggingStatus = 'SdCard: NotPresent';
            break;
            case MSP.SDCARD_STATE_FATAL:
                $(".sdcard-status").html(i18n.getMessage('sdcardStatusReboot'));
                loggingStatus = 'SdCard: Error';
            break;
            case MSP.SDCARD_STATE_READY:
                $(".sdcard-status").text(i18n.getMessage('sdcardStatusReady'));
                loggingStatus = 'SdCard: Ready';
            break;
            case MSP.SDCARD_STATE_CARD_INIT:
                $(".sdcard-status").text(i18n.getMessage('sdcardStatusStarting'));
                loggingStatus = 'SdCard: Init';
            break;
            case MSP.SDCARD_STATE_FS_INIT:
                $(".sdcard-status").text(i18n.getMessage('sdcardStatusFileSystem'));
                loggingStatus = 'SdCard: FsInit';
            break;
            default:
                $(".sdcard-status").text(i18n.getMessage('sdcardStatusUnknown',[FC.SDCARD.state]));
        }

        if (dataflashPresent && FC.SDCARD.state === MSP.SDCARD_STATE_NOT_PRESENT) {
            loggingStatus = 'Dataflash';
            analytics.setFlightControllerData(analytics.DATA.LOG_SIZE, FC.DATAFLASH.usedSize);
        }
        analytics.setFlightControllerData(analytics.DATA.LOGGING_STATUS, loggingStatus);

        if (FC.SDCARD.supported && !sdcardTimer) {
            // Poll for changes in SD card status
            sdcardTimer = setTimeout(function() {
                sdcardTimer = false;
                if (CONFIGURATOR.connectionValid) {
                    MSP.send_message(MSPCodes.MSP_SDCARD_SUMMARY, false, false, function() {
                        update_html();
                    });
                }
            }, 2000);
        }
    }

    // IO related methods
    function flash_save_cancel() {
        saveCancelled = true;
    }

    function show_saving_dialog() {
        $(".dataflash-saving progress").attr("value", 0);
        saveCancelled = false;
        $(".dataflash-saving").removeClass("done");
        $(".dataflash-saving")[0].showModal();
    }

    function dismiss_saving_dialog() {
        $(".dataflash-saving")[0].close();
    }

    function mark_saving_dialog_done(startTime, totalBytes, totalBytesCompressed) {
        analytics.sendEvent(analytics.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'SaveDataflash');

        const totalTime = (new Date().getTime() - startTime) / 1000;
        console.log('Received ' + totalBytes + ' bytes in ' + totalTime.toFixed(2) + 's ('
            + (totalBytes / totalTime / 1024).toFixed(2) + 'kB / s) with block size ' + self.blockSize + '.');
        if (!isNaN(totalBytesCompressed)) {
            console.log('Compressed into', totalBytesCompressed, 'bytes with mean compression factor of', totalBytes / totalBytesCompressed);
        }

        $(".dataflash-saving").addClass("done");
    }

    function flash_update_summary(onDone) {
        MSP.send_message(MSPCodes.MSP_DATAFLASH_SUMMARY, false, false, function() {
            update_html();

            if (onDone) {
                onDone();
            }
        });
    }

    function flash_save_begin() {
        if (GUI.connected_to) {
            if (FC.boardHasVcp()) {
                self.blockSize = self.VCP_BLOCK_SIZE;
            } else {
                self.blockSize = self.BLOCK_SIZE;
            }

            // Begin by refreshing the occupied size in case it changed while the tab was open
            flash_update_summary(function() {
                const maxBytes = FC.DATAFLASH.usedSize;

                prepare_file(function(fileWriter) {
                    let nextAddress = 0;
                    let totalBytesCompressed = 0;

                    show_saving_dialog();

                    function onChunkRead(chunkAddress, chunkDataView, bytesCompressed) {
                        if (chunkDataView !== null) {
                            // Did we receive any data?
                            if (chunkDataView.byteLength > 0) {
                                nextAddress += chunkDataView.byteLength;
                                if (isNaN(bytesCompressed) || isNaN(totalBytesCompressed)) {
                                    totalBytesCompressed = null;
                                } else {
                                    totalBytesCompressed += bytesCompressed;
                                }

                                $(".dataflash-saving progress").attr("value", nextAddress / maxBytes * 100);

                                const blob = new Blob([chunkDataView]);

                                fileWriter.onwriteend = function(e) {
                                    if (saveCancelled || nextAddress >= maxBytes) {
                                        if (saveCancelled) {
                                            dismiss_saving_dialog();
                                        } else {
                                            mark_saving_dialog_done(startTime, nextAddress, totalBytesCompressed);
                                        }
                                    } else {
                                        if (!self.writeError) {
                                            mspHelper.dataflashRead(nextAddress, self.blockSize, onChunkRead);
                                        } else {
                                            dismiss_saving_dialog();
                                        }
                                    }
                                };

                                fileWriter.write(blob);
                            } else {
                                // A zero-byte block indicates end-of-file, so we're done
                                mark_saving_dialog_done(startTime, nextAddress, totalBytesCompressed);
                            }
                        } else {
                            // There was an error with the received block (address didn't match the one we asked for), retry
                            mspHelper.dataflashRead(nextAddress, self.blockSize, onChunkRead);
                        }
                    }

                    const startTime = new Date().getTime();
                    // Fetch the initial block
                    mspHelper.dataflashRead(nextAddress, self.blockSize, onChunkRead);
                });
            });
        }
    }

    function prepare_file(onComplete) {

        const prefix = 'BLACKBOX_LOG';
        const suffix = 'BBL';

        const filename = generateFilename(prefix, suffix);

        chrome.fileSystem.chooseEntry({type: 'saveFile', suggestedName: filename,
                accepts: [{description: suffix.toUpperCase() + ' files', extensions: [suffix]}]}, function(fileEntry) {
            if (checkChromeRuntimeError()) {
                if (chrome.runtime.lastError.message !== "User cancelled") {
                    GUI.log(i18n.getMessage('dataflashFileWriteFailed'));
                }
                return;
            }

            // echo/console log path specified
            chrome.fileSystem.getDisplayPath(fileEntry, function(path) {
                console.log('Dataflash dump file path: ' + path);
            });

            fileEntry.createWriter(function (fileWriter) {
                fileWriter.onerror = function (e) {
                    GUI.log('<strong><span class="message-negative">' + i18n.getMessage('error', { errorMessage: e.target.error.message }) + '</span class="message-negative></strong>');

                    console.error(e);

                    // stop logging if the procedure was/is still running
                    self.writeError = true;
                };

                onComplete(fileWriter);
            }, function (e) {
                // File is not readable or does not exist!
                console.error(e);
                GUI.log(i18n.getMessage('dataflashFileWriteFailed'));
            });
        });
    }

    function ask_to_erase_flash() {
        eraseCancelled = false;
        $(".dataflash-confirm-erase").removeClass('erasing');

        $(".dataflash-confirm-erase")[0].showModal();
    }

    function poll_for_erase_completion() {
        flash_update_summary(function() {
            if (CONFIGURATOR.connectionValid && !eraseCancelled) {
                if (FC.DATAFLASH.ready) {
                    $(".dataflash-confirm-erase")[0].close();
                } else {
                    setTimeout(poll_for_erase_completion, 500);
                }
            }
        });
    }

    function flash_erase() {
        $(".dataflash-confirm-erase").addClass('erasing');

        MSP.send_message(MSPCodes.MSP_DATAFLASH_ERASE, false, false, poll_for_erase_completion);
    }

    function flash_erase_cancel() {
        eraseCancelled = true;
        $(".dataflash-confirm-erase")[0].close();
    }
};

TABS.blackbox.cleanup = function (callback) {
    this.isDirty = false;

    analytics.setFlightControllerData(analytics.DATA.LOGGING_STATUS, undefined);
    analytics.setFlightControllerData(analytics.DATA.LOG_SIZE, undefined);

    if (sdcardTimer) {
        clearTimeout(sdcardTimer);
        sdcardTimer = false;
    }

    if (callback) callback();
};

TABS.blackbox.mscRebootFailedCallback = function () {
    $(".tab-blackbox")
        .toggleClass("msc-supported", false);

    showErrorDialog(i18n.getMessage('operationNotSupported'));
};
