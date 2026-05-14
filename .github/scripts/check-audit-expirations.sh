#!/usr/bin/env bash
# Fails if any audit.toml ignore is past `expires: YYYY-MM-DD` or lacks one.

set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd "$script_dir/../.." && pwd)
audit_file="$repo_root/src-tauri/.cargo/audit.toml"

if [[ ! -f "$audit_file" ]]; then
    echo "audit.toml not found at $audit_file" >&2
    exit 1
fi

today=$(date +%Y-%m-%d)
status=0

while IFS= read -r line; do
    if [[ "$line" =~ \"(RUSTSEC-[0-9]+-[0-9]+)\" ]]; then
        id="${BASH_REMATCH[1]}"
        if [[ "$line" =~ expires:[[:space:]]*([0-9]{4}-[0-9]{2}-[0-9]{2}) ]]; then
            expires="${BASH_REMATCH[1]}"
            if [[ "$expires" < "$today" ]]; then
                echo "ERROR: ignore $id expired on $expires (today is $today). Re-check the advisory or remove the entry." >&2
                status=1
            fi
        else
            echo "ERROR: ignore $id has no 'expires: YYYY-MM-DD' annotation." >&2
            status=1
        fi
    fi
done < "$audit_file"

if [[ $status -eq 0 ]]; then
    echo "All advisory ignores have valid future expiration dates."
fi

exit $status
