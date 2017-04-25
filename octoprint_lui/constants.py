class ClientMessages(object):
    
    FILAMENT_CHANGE_STARTED = "filament_change_started"
    FILAMENT_CHANGE_CANCELLED = "filament_change_cancelled"
    FILAMENT_CHANGE_UNLOAD_STARTED = "filament_unload_started"
    FILAMENT_CHANGE_UNLOAD_FINISHED = "filament_unload_finished"
    FILAMENT_CHANGE_LOAD_STARTED = "filament_load_started"
    FILAMENT_CHANGE_LOAD_PROGRESS = "filament_load_progress"
    FILAMENT_CHANGE_LOAD_FINISHED = "filament_load_finished"

    
    FILAMENT_EXTRUDING_STARTED = "filament_extruding_started"
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
    
    HEAD_IN_SWAP_POSITION = "head_in_swap_position"
    POWERING_UP_AFTER_SWAP = "powering_up_after_swap"

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

    CLOUD_LOGIN_FAILED = "cloud_login_failed"

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

class PrintModes(object):
    FULL_CONTROL = 0
    NORMAL = 1
    SYNC = 2
    MIRROR = 3

    @staticmethod
    def get_from_string(print_mode_string):
        if print_mode_string == 'fullcontrol':
            return PrintModes.FULL_CONTROL
        elif print_mode_string == 'normal':
            return PrintModes.NORMAL
        elif print_mode_string == 'sync':
            return PrintModes.SYNC
        elif print_mode_string == 'mirror':
            return PrintModes.MIRROR
        else:
            return PrintModes.NORMAL
    @staticmethod
    def to_string(print_mode):
        if print_mode == PrintModes.FULL_CONTROL:
            return 'fullcontrol'
        elif print_mode == PrintModes.NORMAL:
            return 'normal'
        elif print_mode == PrintModes.SYNC:
            return 'sync'
        elif print_mode == PrintModes.MIRROR:
            return 'mirror'
        else:
            return 'normal'

class ExtrusionModes(object):
    ABSOLUTE = "absolute"
    RELATIVE = "relative"

class MovementModes(object):
    ABSOLUTE = "absolute"
    RELATIVE = "relative"
