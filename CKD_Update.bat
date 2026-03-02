@echo off
title CKD Project - Pull Latest (main)

echo ======================================
echo   Pulling Latest Changes from main
echo ======================================
echo.

cd /d E:\ckd\version_3_ckd_1

git pull origin main

echo.
echo ======================================
echo   Pull Complete
echo ======================================
pause