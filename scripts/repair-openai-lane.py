from pathlib import Path

path = Path('.github/workflows/orchid-completion-lane.yml')
text = path.read_text()

old_exec = '''          git config --local --unset-all http.https://github.com/.extraheader 2>/dev/null || true
          set +e
          env -u GH_TOKEN OPENAI_API_KEY="$OPENAI_API_KEY" timeout 35m \\
            npx -y @openai/codex@latest --ask-for-approval never exec \\
            --sandbox workspace-write --skip-git-repo-check --ephemeral -C "$GITHUB_WORKSPACE" "$prompt" \\
            > "$RUNNER_TEMP/openai-stdout.log" 2> "$RUNNER_TEMP/openai-stderr.log"
          status=$?
'''
new_exec = '''          git config --local --unset-all http.https://github.com/.extraheader 2>/dev/null || true
          export CODEX_HOME="$RUNNER_TEMP/codex-home"
          mkdir -p "$CODEX_HOME"
          set +e
          printf '%s\\n' "$OPENAI_API_KEY" | npx -y @openai/codex@0.151.0 login --with-api-key \\
            > "$RUNNER_TEMP/openai-login.log" 2>> "$RUNNER_TEMP/openai-stderr.log"
          login_status=$?
          if [[ "$login_status" -eq 0 ]]; then
            env -u GH_TOKEN OPENAI_API_KEY="$OPENAI_API_KEY" CODEX_HOME="$CODEX_HOME" timeout 35m \\
              npx -y @openai/codex@0.151.0 --ask-for-approval never exec \\
              --sandbox workspace-write --skip-git-repo-check --ephemeral -C "$GITHUB_WORKSPACE" "$prompt" \\
              > "$RUNNER_TEMP/openai-stdout.log" 2>> "$RUNNER_TEMP/openai-stderr.log"
            status=$?
          else
            status=$login_status
          fi
'''

old_security = '''            elif grep -Eqi '401|403|unauthor|forbidden|invalid.?api.?key|authentication|permission' "$RUNNER_TEMP/openai-stderr.log" "$RUNNER_TEMP/openai-stdout.log" 2>/dev/null; then
              kind=security
            elif grep -Eqi '429|quota|rate.?limit|billing|credit|overloaded|service unavailable|temporarily unavailable|timeout|timed out|connection' "$RUNNER_TEMP/openai-stderr.log" "$RUNNER_TEMP/openai-stdout.log" 2>/dev/null || [[ "$(cat "$RUNNER_TEMP/openai-exit.txt" 2>/dev/null || true)" == "124" ]]; then
'''
new_security = '''            elif grep -Eqi '(^|[^0-9])(401|403)([^0-9]|$)|unauthori[sz]ed|invalid[_ .-]?api[_ .-]?key|authentication (failed|required)|missing scopes?:|insufficient permissions?.*(api|operation)|api\\.responses\\.write' "$RUNNER_TEMP/openai-stderr.log" 2>/dev/null; then
              kind=security
            elif grep -Eqi '429|quota|rate.?limit|billing|credit|overloaded|service unavailable|temporarily unavailable|timeout|timed out|connection|websocket.*(reset|closed|failed)' "$RUNNER_TEMP/openai-stderr.log" 2>/dev/null || [[ "$(cat "$RUNNER_TEMP/openai-exit.txt" 2>/dev/null || true)" == "124" ]]; then
'''

if old_exec in text:
    text = text.replace(old_exec, new_exec, 1)
elif '@openai/codex@0.151.0 login --with-api-key' not in text:
    raise SystemExit('expected OpenAI execution block not found')

if old_security in text:
    text = text.replace(old_security, new_security, 1)
elif 'api\\.responses\\.write' not in text or 'openai-stderr.log" "$RUNNER_TEMP/openai-stdout.log' in text:
    raise SystemExit('expected OpenAI classifier block not found')

path.write_text(text)
