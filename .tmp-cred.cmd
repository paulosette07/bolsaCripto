@echo off
cd /d c:\dev\bolsa
set GCM_INTERACTIVE=never
set GCM_ALLOW_INTERACTIVE=false
set GIT_TERMINAL_PROMPT=0
git credential fill < .tmp-cred-input.txt > .tmp-cred.txt 2>&1
exit /b 0
