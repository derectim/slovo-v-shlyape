$ErrorActionPreference = "Stop"

if (-not (Get-Command flutter -ErrorAction SilentlyContinue)) {
    throw "Flutter не найден. Установите Flutter SDK и добавьте его в PATH."
}

Write-Host "Создаём платформенные файлы Android и iOS..." -ForegroundColor Cyan
flutter create --platforms=android,ios .

Write-Host "Устанавливаем зависимости..." -ForegroundColor Cyan
flutter pub get

Write-Host "Проверяем проект..." -ForegroundColor Cyan
flutter analyze

Write-Host "Готово. Для запуска выполните: flutter run" -ForegroundColor Green
