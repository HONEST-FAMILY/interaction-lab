#!/usr/bin/env bash
set -euo pipefail
mode="${1:?show|append|restore}"
pid="${2:?dashboard project id}"
arg="${3:-}"
host="${HF_SSH_HOST:-forge@3.36.39.123}"
key="${HF_SSH_KEY:-$HOME/.ssh/honest-family.pem}"
case "$mode" in
  show) payload="" ;;
  append|restore) [ -n "$arg" ] || { echo "file needed"; exit 1; }; payload="$(base64 -w0 < "$arg")" ;;
  *) echo "mode: show|append|restore"; exit 1 ;;
esac
name="pnote-$(date +%s)-$$.php"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
cat > "$tmp" <<'PHP'
<?php
$root = getcwd();
require $root.'/vendor/autoload.php';
$app = require $root.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$mode = $argv[1] ?? '';
$pid = (int) ($argv[2] ?? 0);
$arg = isset($argv[3]) && $argv[3] !== '' ? base64_decode($argv[3], true) : '';
$dry = getenv('DRY') === '1';

$p = App\Models\Project::withoutGlobalScope(App\Scopes\ProjectScope::class)->find($pid);
if (!$p) {
    fwrite(STDERR, "project not found\n");
    exit(2);
}
$old = (string) $p->notes;
$out = ['project_id' => $p->id, 'name' => $p->name, 'before_len' => mb_strlen($old), 'before_sha1' => sha1($old), 'before_b64' => base64_encode($old)];

$audit = function (array $meta) use ($p, &$out) {
    try {
        App\Services\AuditService::log('project.updated', $p, ['fields' => ['notes']] + $meta);
        $out['audit'] = 'ok';
    } catch (Throwable $e) {
        $out['audit'] = 'failed: '.$e->getMessage();
    }
};

if ($mode === 'append') {
    $block = trim(str_replace("\r\n", "\n", (string) $arg));
    if ($block === '' || $arg === false) {
        fwrite(STDERR, "empty block\n");
        exit(3);
    }
    if (str_contains($old, $block)) {
        $out['result'] = 'already';
    } else {
        $sep = $old === '' ? '' : (str_ends_with($old, "\n\n") ? '' : (str_ends_with($old, "\n") ? "\n" : "\n\n"));
        $out['result'] = $dry ? 'dry-run' : 'appended';
        $out['preview_tail'] = mb_substr($old.$sep.$block, -400);
        if (!$dry) {
            $p->notes = $old.$sep.$block;
            $p->save();
            $audit(['appended' => mb_substr(strtok($block, "\n"), 0, 200)]);
        }
    }
    $p->refresh();
    $out['ends_with_block'] = str_ends_with((string) $p->notes, $block);
} elseif ($mode === 'restore') {
    $backup = str_replace("\r\n", "\n", (string) $arg);
    if (!str_starts_with($old, $backup) || $old === $backup) {
        $out['result'] = $old === $backup ? 'already' : 'refused: notes changed beyond the appended block';
    } else {
        $out['removed_tail'] = mb_substr($old, mb_strlen($backup));
        $out['result'] = $dry ? 'dry-run' : 'restored';
        if (!$dry) {
            $p->notes = $backup;
            $p->save();
            $audit(['restored_len' => mb_strlen($backup)]);
        }
    }
    $p->refresh();
}
$after = (string) $p->notes;
$out['after_len'] = mb_strlen($after);
$out['after_sha1'] = sha1($after);
echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)."\n";
PHP
scp -q -i "$key" "$tmp" "$host:/tmp/$name"
ssh -i "$key" "$host" "cd /home/forge/api.dashboard.honest-family.com && DRY='${DRY:-0}' php8.2 /tmp/$name '$mode' '$pid' '$payload'; rc=\$?; rm -f /tmp/$name; exit \$rc"
