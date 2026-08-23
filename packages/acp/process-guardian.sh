#!/bin/sh

set -u

if [ "$#" -lt 1 ]; then
  exit 64
fi

guardian_pid=$$
child_pid=''
watcher_pid=''
timer_pid=''
runtime_dir=''
stdin_fifo=''

cleanup_paths() {
  if [ -n "$stdin_fifo" ]; then rm -f "$stdin_fifo"; fi
  if [ -n "$runtime_dir" ]; then rmdir "$runtime_dir" 2>/dev/null || true; fi
}

group_has_descendants() {
  /bin/ps -o pid= -g "$guardian_pid" 2>/dev/null | awk \
    -v guardian="$guardian_pid" -v watcher="$watcher_pid" -v timer="$timer_pid" '
    $1 != guardian && $1 != watcher && $1 != timer { found = 1 }
    END { exit found ? 0 : 1 }
  '
}

force_group() {
  trap '' ALRM HUP INT TERM
  cleanup_paths
  kill -KILL -- "-$guardian_pid" 2>/dev/null || true
  exit 137
}

stop_group() {
  exit_code="$1"
  trap '' HUP INT TERM
  if [ -n "$child_pid" ]; then
    kill -TERM -- "-$guardian_pid" 2>/dev/null || true
    trap 'force_group' ALRM
    (sleep 1.2; kill -ALRM "$guardian_pid" 2>/dev/null || true) &
    timer_pid=$!
    wait "$child_pid" 2>/dev/null || true
    wait "$watcher_pid" 2>/dev/null || true
    if ! group_has_descendants; then
      kill -TERM "$timer_pid" 2>/dev/null || true
      wait "$timer_pid" 2>/dev/null || true
      cleanup_paths
      exit "$exit_code"
    fi
    wait "$timer_pid" 2>/dev/null || true
    force_group
  fi
  cleanup_paths
  exit "$exit_code"
}

trap 'stop_group 129' HUP
trap 'stop_group 130' INT
trap 'stop_group 143' TERM

runtime_dir=$(mktemp -d "${TMPDIR:-/tmp}/agentwolf-guardian.XXXXXX") || exit 70
stdin_fifo="$runtime_dir/stdin"
mkfifo "$stdin_fifo" || exit 70
exec 4<&0

(
  if cat <&4 > "$stdin_fifo"; then
    kill -HUP "$guardian_pid" 2>/dev/null || true
  fi
) &
watcher_pid=$!

"$@" 4<&- < "$stdin_fifo" &
child_pid=$!

wait "$child_pid"
status=$?
kill -TERM "$watcher_pid" 2>/dev/null || true
wait "$watcher_pid" 2>/dev/null || true
cleanup_paths
exit "$status"
