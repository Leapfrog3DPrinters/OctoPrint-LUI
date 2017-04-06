class ClientMessages(object):
    
    FILAMENT_CHANGE_IN_PROGRESS = "filament_change_in_progress"
    FILAMENT_CHANGE_SKIP_UNLOAD = "skip_unload"
    FILAMENT_CHANGE_FINISHED = "filament_finished"
    FILAMENT_CHANGE_CANCELED = "filament_cancelled"
    FILAMENT_LOADING = "filament_loading"
    FILAMENT_LOAD_PROGRESS = "filament_load_progress"
    FILAMENT_UNLOADING = "filament_unloading"
    FILAMENT_EXTRUDING = "filament_extruding"
    FILAMENT_EXTRUDING_FINISHED = "filament_extruding_finished"

    FILAMENT_ACTION_DETECTED = "filament_action_detected"
    TEMPERATURE_SAFETY = "temperature_safety"

    UPDATE_FILAMENT_AMOUNT = "update_filament_amount"

    TOOL_STATUS = "tool_status"
    TOOL_HEATING = "tool_heating"

    IS_HOMING = "is_homing"
    IS_HOMED = "is_homed"

    LEVELBED_COMPLETE = "levelbed_complete"
    LEVELBED_PROGRESS = "levelbed_progress"

    CALIBRATION_STARTED = "calibration_started"
    CALIBRATION_PAUSED = "calibration_paused"
    CALIBRATION_RESUMED = "calibration_resumed"
    CALIBRATION_FINISHED = "calibration_completed"
    CALIBRATION_FAILED = "calibration_failed"
    
    HEAD_IN_MAINTENANCE_POSITION = "head_in_maintenance_position"
    POWERING_UP_AFTER_MAINTENANCE = "powering_up_after_maintenance"

    MEDIA_FOLDER_UPDATED = "media_folder_updated"
    MEDIA_FILE_COPY_PROGRESS = "media_file_copy_progress"
    MEDIA_FILE_COPY_COMPLETE = "media_file_copy_complete"
    MEDIA_FILE_COPY_FAILED = "media_file_copy_failed"

    GCODE_COPY_PROGRESS = "gcode_copy_progress"
    GCODE_COPY_FINISHED = "gcode_copy_complete"
    GCODE_COPY_FAILED = "gcode_copy_failed"

    TIMELAPSE_COPY_PROGRESS = "timelapse_copy_progress"
    TIMELAPSE_COPY_FINISHED = "timelapse_copy_complete"
    TIMELAPSE_COPY_FAILED = "timelapse_copy_failed"

    LOGS_COPY_PROGRESS = "logs_copy_progress"
    LOGS_COPY_FINISHED = "logs_copy_complete"
    LOGS_COPY_FAILED = "logs_copy_failed"

    POWERBUTTON_PRESSED = "powerbutton_pressed"

    MACHINE_INFO_UPDATED = "machine_info_updated"

    PRINTER_ERROR_REASON_UPDATE = "printer_error_reason_update"

    AUTO_SHUTDOWN_START = "auto_shutdown_start"
    AUTO_SHUTDOWN_WAIT_ON_RENDER = "auto_shutdown_wait_on_render"
    AUTO_SHUTDOWN_TIMER = "auto_shutdown_timer"
    AUTO_SHUTDOWN_TIMER_CANCELLED = "auto_shutdown_timer_cancelled"
    AUTO_SHUTDOWN_TOGGLE = "auto_shutdown_toggle"

    GITHUB_OFFLINE = "github_offline"
    INTERNET_OFFLINE = "internet_offline"
    FORCED_UPDATE = "forced_update"
    UPDATE_ERROR = "update_error"
    UPDATE_SUCCESS = "update_success"
    UPDATE_FETCH_ERROR = "update_fetch_error"
    UPDATE_FETCH_SUCCESS = "update_fetch_success"

    FIRMWARE_UPDATE_NOTIFICATION = "firmware_update_notification"
    AUTO_FIRMWARE_UPDATE_STARTED = "auto_firmware_update_started"
    AUTO_FIRMWARE_UPDATE_FAILED = "auto_firmware_update_failed"
    AUTO_FIRMWARE_UPDATE_FINISHED = "auto_firmware_update_finished"


class ToolStatuses(object):
    IDLE = 'IDLE'
    HEATING = 'HEATING'
    COOLING = 'COOLING'
    STABILIZING = 'STABILIZING'
    READY = 'READY'
