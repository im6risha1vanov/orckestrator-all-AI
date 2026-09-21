package main

import (
	"archive/zip"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/jchv/go-webview2"
	"golang.org/x/sys/windows"
)

const (
	nodeURL    = "https://nodejs.org/dist/v22.14.0/win-x64/node.exe"
	buildStamp = "2026-09-20e"
)

var appURL = "http://127.0.0.1:43147/"

const splash = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<style>
  html,body{height:100%;margin:0;background:#0b0c10;color:#e4e4e7;
    font-family:"Segoe UI",system-ui,sans-serif}
  body{display:flex;align-items:center;justify-content:center;
    background:radial-gradient(1200px 500px at 50% -10%,rgba(56,189,248,.18),transparent 55%),#0b0c10}
  .box{text-align:center;max-width:26rem;padding:1.5rem}
  .logo-img{width:5.5rem;height:5.5rem;margin:0 auto 1.1rem;display:block;border-radius:1.25rem;
    box-shadow:0 12px 40px rgba(56,189,248,.28)}
  .logo-letter{width:5.5rem;height:5.5rem;margin:0 auto 1.1rem;border-radius:1.25rem;
    background:linear-gradient(135deg,#38bdf8,#8b5cf6);color:#fff;
    font-size:2rem;font-weight:600;display:flex;align-items:center;justify-content:center}
  h1{font-size:1.45rem;font-weight:560;letter-spacing:-.02em;margin:0 0 .45rem}
  p{margin:0;color:#a1a1aa;font-size:.92rem;line-height:1.5;white-space:pre-wrap}
  .err{color:#fda4af;margin-top:.8rem}
</style></head>
<body><div class="box">
  {{LOGO}}
  <h1>Артель</h1>
  <p id="s">{{STATUS}}</p>
</div></body></html>`

func main() {
	exe, err := os.Executable()
	if err != nil {
		fail("Не удалось найти папку программы: " + err.Error())
	}
	root := filepath.Dir(exe)
	logPath := filepath.Join(root, "artel.log")
	logFile, _ := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if logFile != nil {
		defer logFile.Close()
	}
	logf := func(format string, args ...any) {
		line := time.Now().Format("2006-01-02 15:04:05") + " " + fmt.Sprintf(format, args...) + "\n"
		if logFile != nil {
			_, _ = logFile.WriteString(line)
		}
	}
	logf("старт сборка %s из %s", buildStamp, root)

	bootJs := filepath.Join(root, "app", "boot-server.js")
	serverJs := filepath.Join(root, "app", "server.js")
	if _, err := os.Stat(bootJs); err != nil {
		if _, err2 := os.Stat(serverJs); err2 != nil {
			fail("Нет app\\server.js. Распакуй архив целиком: папка Artel с Artel.exe и app рядом.")
		}
	}

	dest, relocate := installDest(root)
	logf("dest=%s relocate=%v", dest, relocate)

	dataPath := filepath.Join(root, "webview-data")
	_ = os.MkdirAll(dataPath, 0755)

	view := webview2.NewWithOptions(webview2.WebViewOptions{
		AutoFocus: true,
		DataPath:  dataPath,
		WindowOptions: webview2.WindowOptions{
			Title:  "Артель",
			Width:  1440,
			Height: 900,
			Center: true,
			IconId: 1,
		},
	})

	var proc *os.Process
	setStatus := func(msg string) {
		if view == nil {
			return
		}
		payload, _ := json.Marshal(msg)
		view.Dispatch(func() {
			view.Eval(`var el=document.getElementById("s"); if(el) el.textContent=` + string(payload) + `;`)
		})
	}

	startBackend := func() error {
		setStatus("Проверяю Node.js…")
		node, err := ensureNode(root, logf, setStatus)
		if err != nil {
			return err
		}
		port, err := pickPort()
		if err != nil {
			return err
		}
		appURL = fmt.Sprintf("http://127.0.0.1:%d/", port)
		logf("порт %d", port)
		setStatus("Запускаю сервер…")
		entry := "boot-server.js"
		if _, err := os.Stat(filepath.Join(root, "app", entry)); err != nil {
			entry = "server.js"
		}
		cmd := exec.Command(node, entry)
		cmd.Dir = filepath.Join(root, "app")
		cmd.Env = append(os.Environ(),
			fmt.Sprintf("PORT=%d", port),
			"HOSTNAME=127.0.0.1",
			"NODE_ENV=production",
		)
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
		if logFile != nil {
			cmd.Stdout = logFile
			cmd.Stderr = logFile
		}
		if err := cmd.Start(); err != nil {
			return fmt.Errorf("не удалось запустить сервер: %w", err)
		}
		proc = cmd.Process
		exited := make(chan error, 1)
		go func() { exited <- cmd.Wait() }()

		ready := make(chan error, 1)
		go func() { ready <- waitReady(25 * time.Second) }()

		select {
		case err := <-exited:
			proc = nil
			hint := tailLog(logPath, 12)
			if hint != "" {
				return fmt.Errorf("сервер сразу закрылся: %v\n\n%s", err, hint)
			}
			return fmt.Errorf("сервер сразу закрылся: %v. Смотри artel.log рядом с Artel.exe", err)
		case err := <-ready:
			if err != nil {
				return fmt.Errorf("%w\nЗакрой это окно и запусти Artel.exe снова. Подробности — artel.log", err)
			}
			return nil
		}
	}

	stopBackend := func() {
		if proc != nil {
			_ = proc.Kill()
			_, _ = proc.Wait()
		}
	}

	showErr := func(err error) {
		logf("ошибка: %v", err)
		msg := err.Error()
		if view != nil {
			view.Dispatch(func() {
				view.SetHtml(splashHTML(root, msg))
			})
			return
		}
		fail(msg)
	}

	if view != nil {
		view.SetHtml(splashHTML(root, "Сборка "+buildStamp+"\nЗапускаю…"))
		go func() {
			if relocate {
				setStatus("Копирую в " + dest + " …\nПуть в AgentStores слишком длинный для Node.js")
				if err := installTo(root, dest, logf, setStatus); err != nil {
					showErr(fmt.Errorf("не удалось скопировать в %s: %w", dest, err))
					return
				}
				logf("перезапуск из %s", dest)
				if err := launchDetached(filepath.Join(dest, "Artel.exe")); err != nil {
					showErr(fmt.Errorf("скопировал в %s, но не запустил: %w\nЗапусти %s\\Artel.exe сам", dest, err, dest))
					return
				}
				os.Exit(0)
			}
			if err := startBackend(); err != nil {
				stopBackend()
				showErr(err)
				return
			}
			url := appURL
			view.Dispatch(func() {
				view.Navigate(url)
			})
		}()
		view.Run()
		view.Destroy()
		stopBackend()
		return
	}

	logf("WebView2 недоступен, пробую окно Microsoft Edge")
	if relocate {
		if err := installTo(root, dest, logf, func(string) {}); err != nil {
			fail(err.Error())
		}
		if err := launchDetached(filepath.Join(dest, "Artel.exe")); err != nil {
			fail(err.Error())
		}
		return
	}
	if err := startBackend(); err != nil {
		fail(err.Error())
	}
	edge := startEdgeWindow(root)
	if edge == nil {
		stopBackend()
		fail("Нужен Microsoft Edge или WebView2 Runtime. Установи Edge и запусти Artel.exe снова.")
	}
	_, _ = edge.Process.Wait()
	stopBackend()
}

func splashHTML(root, status string) string {
	logo := `<div class="logo-letter">А</div>`
	if raw, err := os.ReadFile(filepath.Join(root, "artel-icon.png")); err == nil {
		logo = `<img class="logo-img" src="data:image/png;base64,` + base64.StdEncoding.EncodeToString(raw) + `" alt="Артель">`
	}
	html := strings.Replace(splash, "{{LOGO}}", logo, 1)
	return strings.Replace(html, "{{STATUS}}", htmlEscape(status), 1)
}

func htmlEscape(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;")
	return r.Replace(s)
}

func installDest(root string) (string, bool) {
	abs, err := filepath.Abs(root)
	if err != nil {
		abs = root
	}
	abs = filepath.Clean(abs)
	candidates := []string{
		`C:\Artel`,
		filepath.Join(os.Getenv("USERPROFILE"), "Artel"),
		filepath.Join(os.Getenv("LOCALAPPDATA"), "Artel"),
	}
	for _, c := range candidates {
		if c == "" {
			continue
		}
		if strings.EqualFold(abs, filepath.Clean(c)) {
			return abs, false
		}
	}
	lower := strings.ToLower(abs)
	nested := strings.Contains(lower, "agentstores") ||
		strings.Contains(lower, "cursor\\stores") ||
		strings.Contains(lower, "cursor/stores")
	if !nested && len(abs) <= 80 {
		return abs, false
	}
	for _, c := range candidates {
		if c == "" {
			continue
		}
		if err := os.MkdirAll(c, 0755); err != nil {
			continue
		}
		test := filepath.Join(c, ".artel-write")
		if err := os.WriteFile(test, []byte("ok"), 0644); err == nil {
			_ = os.Remove(test)
			return c, true
		}
	}
	return abs, false
}

func installTo(src, dest string, logf func(string, ...any), setStatus func(string)) error {
	if err := os.MkdirAll(dest, 0755); err != nil {
		return err
	}
	stampFile := filepath.Join(dest, "build-id.txt")
	if installComplete(dest) {
		logf("уже установлено в %s", dest)
		return nil
	}

	// Prefer the folder sitting next to this exe. An older/larger zip in AgentStores
	// must not overwrite a complete app (that was the @next/env miss).
	if packageComplete(src) {
		setStatus("Копирую файлы в " + dest + " …")
		logf("copy complete tree %s -> %s", src, dest)
		if err := robocopy(src, dest); err != nil {
			if err := copyTree(src, dest); err != nil {
				return err
			}
		}
		_ = os.WriteFile(stampFile, []byte(buildStamp+"\n"), 0644)
		return nil
	}

	if zipPath := findZip(src); zipPath != "" {
		setStatus("Распаковываю архив в " + dest + " …")
		logf("unzip %s -> %s", zipPath, dest)
		if err := unzipArtel(zipPath, dest, setStatus); err != nil {
			logf("unzip: %v, пробую копирование", err)
		} else {
			_ = os.WriteFile(stampFile, []byte(buildStamp+"\n"), 0644)
			copyRuntime(src, dest)
			return nil
		}
	}

	setStatus("Копирую файлы в " + dest + " …")
	logf("copy %s -> %s", src, dest)
	if err := robocopy(src, dest); err != nil {
		if err := copyTree(src, dest); err != nil {
			return err
		}
	}
	_ = os.WriteFile(stampFile, []byte(buildStamp+"\n"), 0644)
	return nil
}

func packageComplete(root string) bool {
	_, err := os.Stat(filepath.Join(root, "app", "node_modules", "@next", "env", "package.json"))
	return err == nil
}

func installComplete(dest string) bool {
	b, err := os.ReadFile(filepath.Join(dest, "build-id.txt"))
	if err != nil || strings.TrimSpace(string(b)) != buildStamp {
		return false
	}
	if _, err := os.Stat(filepath.Join(dest, "Artel.exe")); err != nil {
		return false
	}
	return packageComplete(dest)
}

func findZip(root string) string {
	dirs := []string{root, filepath.Dir(root), filepath.Join(root, "..")}
	var matching []string
	var anyZip []string
	for _, d := range dirs {
		entries, err := os.ReadDir(d)
		if err != nil {
			continue
		}
		for _, e := range entries {
			name := e.Name()
			low := strings.ToLower(name)
			if e.IsDir() || !strings.HasSuffix(low, ".zip") || !strings.Contains(low, "artel-windows") {
				continue
			}
			p := filepath.Join(d, name)
			st, err := os.Stat(p)
			if err != nil || st.Size() < 1_000_000 {
				continue
			}
			anyZip = append(anyZip, p)
			if zipHasStamp(p, buildStamp) {
				matching = append(matching, p)
			}
		}
	}
	if len(matching) > 0 {
		return matching[0]
	}
	if len(anyZip) > 0 {
		return anyZip[0]
	}
	return ""
}

func zipHasStamp(zipPath, stamp string) bool {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return false
	}
	defer r.Close()
	for _, f := range r.File {
		if !strings.HasSuffix(strings.ReplaceAll(f.Name, "\\", "/"), "build-id.txt") {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return false
		}
		data, _ := io.ReadAll(rc)
		rc.Close()
		return strings.TrimSpace(string(data)) == stamp
	}
	return false
}

func unzipArtel(zipPath, dest string, setStatus func(string)) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()
	destAbs, _ := filepath.Abs(dest)
	total := len(r.File)
	for i, f := range r.File {
		name := strings.ReplaceAll(f.Name, "\\", "/")
		name = strings.TrimPrefix(name, "/")
		if strings.HasPrefix(name, "Artel/") {
			name = strings.TrimPrefix(name, "Artel/")
		}
		if name == "" {
			continue
		}
		low := strings.ToLower(name)
		if strings.HasPrefix(low, "webview-data/") || strings.HasPrefix(low, "edge-app/") {
			continue
		}
		target := filepath.Join(destAbs, filepath.FromSlash(name))
		rel, err := filepath.Rel(destAbs, target)
		if err != nil || strings.HasPrefix(rel, "..") {
			continue
		}
		if f.FileInfo().IsDir() || strings.HasSuffix(name, "/") {
			_ = os.MkdirAll(target, 0755)
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
		if err != nil {
			rc.Close()
			return err
		}
		_, copyErr := io.Copy(out, rc)
		out.Close()
		rc.Close()
		if copyErr != nil {
			return copyErr
		}
		if i%400 == 0 {
			setStatus(fmt.Sprintf("Распаковываю в %s … %d/%d", dest, i, total))
		}
	}
	return nil
}

func copyRuntime(src, dest string) {
	from := filepath.Join(src, "runtime", "node.exe")
	toDir := filepath.Join(dest, "runtime")
	to := filepath.Join(toDir, "node.exe")
	if _, err := os.Stat(to); err == nil {
		return
	}
	in, err := os.Open(from)
	if err != nil {
		return
	}
	defer in.Close()
	_ = os.MkdirAll(toDir, 0755)
	out, err := os.Create(to)
	if err != nil {
		return
	}
	_, _ = io.Copy(out, in)
	out.Close()
}

func robocopy(src, dest string) error {
	cmd := exec.Command("robocopy", src, dest, "/E", "/XD", "webview-data", "edge-app", "/XF", "artel.log", "/R:1", "/W:1", "/NFL", "/NDL", "/NJH", "/NJS")
	err := cmd.Run()
	code := 0
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			code = ee.ExitCode()
		} else {
			return err
		}
	}
	if code >= 8 {
		return fmt.Errorf("robocopy %d", code)
	}
	return nil
}

func copyTree(src, dest string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		low := strings.ToLower(rel)
		if strings.HasPrefix(low, "webview-data") || strings.HasPrefix(low, "edge-app") || strings.EqualFold(rel, "artel.log") {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		target := filepath.Join(dest, rel)
		if info.IsDir() {
			return os.MkdirAll(target, 0755)
		}
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return err
		}
		in, err := os.Open(path)
		if err != nil {
			return err
		}
		defer in.Close()
		out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
		if err != nil {
			return err
		}
		_, copyErr := io.Copy(out, in)
		closeErr := out.Close()
		if copyErr != nil {
			return copyErr
		}
		return closeErr
	})
}

func launchDetached(exe string) error {
	cmd := exec.Command(exe)
	cmd.Dir = filepath.Dir(exe)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: 0x00000008 | 0x00000200,
	}
	return cmd.Start()
}

func ensureNode(root string, logf func(string, ...any), setStatus func(string)) (string, error) {
	runtimeDir := filepath.Join(root, "runtime")
	node := filepath.Join(runtimeDir, "node.exe")
	if info, err := os.Stat(node); err == nil && info.Size() > 1_000_000 {
		return node, nil
	}
	_ = os.Remove(node)
	logf("скачиваю Node.js")
	setStatus("Скачиваю Node.js (~80 МБ). Не закрывай окно…")
	if err := os.MkdirAll(runtimeDir, 0755); err != nil {
		return "", fmt.Errorf("не создать runtime: %w", err)
	}
	if err := download(nodeURL, node, setStatus); err != nil {
		return "", fmt.Errorf("не удалось скачать Node.js (нужен интернет): %w", err)
	}
	return node, nil
}

func pickPort() (int, error) {
	for _, addr := range []string{"127.0.0.1:43147", "127.0.0.1:0"} {
		ln, err := net.Listen("tcp", addr)
		if err != nil {
			continue
		}
		port := ln.Addr().(*net.TCPAddr).Port
		_ = ln.Close()
		return port, nil
	}
	return 0, fmt.Errorf("нет свободного локального порта")
}

func waitReady(d time.Duration) error {
	client := &http.Client{Timeout: 1500 * time.Millisecond}
	deadline := time.Now().Add(d)
	var last error
	for time.Now().Before(deadline) {
		resp, err := client.Get(appURL)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode < 500 {
				return nil
			}
			last = fmt.Errorf("HTTP %d", resp.StatusCode)
		} else {
			last = err
		}
		time.Sleep(300 * time.Millisecond)
	}
	if last == nil {
		last = fmt.Errorf("таймаут")
	}
	return fmt.Errorf("сервер не ответил за %s: %w", d, last)
}

func startEdgeWindow(root string) *exec.Cmd {
	candidates := []string{
		filepath.Join(os.Getenv("ProgramFiles(x86)"), `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(os.Getenv("ProgramFiles"), `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(os.Getenv("LOCALAPPDATA"), `Microsoft\Edge\Application\msedge.exe`),
	}
	var edge string
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			edge = p
			break
		}
	}
	if edge == "" {
		return nil
	}
	profile := filepath.Join(root, "edge-app")
	cmd := exec.Command(edge,
		"--app="+appURL,
		"--window-size=1440,900",
		"--user-data-dir="+profile,
	)
	if err := cmd.Start(); err != nil {
		return nil
	}
	return cmd
}

func download(url, dest string, setStatus func(string)) error {
	tmp := dest + ".part"
	client := &http.Client{
		Timeout: 5 * time.Minute,
		Transport: &http.Transport{
			ResponseHeaderTimeout: 25 * time.Second,
		},
	}
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("HTTP %s", resp.Status)
	}
	out, err := os.Create(tmp)
	if err != nil {
		return err
	}
	var written int64
	buf := make([]byte, 32*1024)
	lastReport := time.Now()
	total := resp.ContentLength
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if _, err := out.Write(buf[:n]); err != nil {
				_ = out.Close()
				return err
			}
			written += int64(n)
			if time.Since(lastReport) > time.Second {
				if total > 0 {
					setStatus(fmt.Sprintf("Скачиваю Node.js… %d%%", written*100/total))
				} else {
					setStatus(fmt.Sprintf("Скачиваю Node.js… %d МБ", written/1024/1024))
				}
				lastReport = time.Now()
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			_ = out.Close()
			return readErr
		}
	}
	if err := out.Close(); err != nil {
		return err
	}
	if written < 1_000_000 {
		return fmt.Errorf("файл Node.js слишком маленький (%d байт)", written)
	}
	return os.Rename(tmp, dest)
}

func tailLog(path string, lines int) string {
	data, err := os.ReadFile(path)
	if err != nil || len(data) == 0 {
		return ""
	}
	parts := strings.Split(strings.ReplaceAll(string(data), "\r\n", "\n"), "\n")
	var nonempty []string
	for _, line := range parts {
		if strings.TrimSpace(line) != "" {
			nonempty = append(nonempty, line)
		}
	}
	if len(nonempty) > lines {
		nonempty = nonempty[len(nonempty)-lines:]
	}
	return strings.Join(nonempty, "\n")
}

func fail(msg string) {
	text, _ := windows.UTF16PtrFromString(msg)
	caption, _ := windows.UTF16PtrFromString("Артель")
	_, _ = windows.MessageBox(0, text, caption, windows.MB_OK|windows.MB_ICONERROR)
	os.Exit(1)
}
