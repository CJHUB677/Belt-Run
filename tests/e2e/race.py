import asyncio, sys, json
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        errs = []
        page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        await page.goto(URL); await page.wait_for_timeout(800)
        # career event 1 with the starter Civic Si
        await page.evaluate("__belt.S.current='civicsi'; __belt.go('races')")
        await page.wait_for_timeout(300)
        await page.click('#race-tabs [data-tab=career]')
        await page.click('.ev >> nth=0'); await page.wait_for_timeout(300)
        await page.screenshot(path='shots/03-prerace.png')
        await page.click('#pr-go'); await page.wait_for_timeout(1200)
        gas = await page.query_selector('#btn-gas'); box = await gas.bounding_box()
        await page.screenshot(path='shots/04-staging.png')
        # hold the pedal (touch) until the rev needle is near the launch zone
        await page.mouse.move(box['x'] + box['width']/2, box['y'] + box['height']/2)
        held = False
        t0 = await page.evaluate("performance.now()")
        shots = 0
        for i in range(400):
            ph = await page.evaluate("document.getElementById('race').hidden ? 'done' : 'x'")
            if ph == 'done': break
            st = await page.evaluate("(()=>{const r=window.__race; return r? {ph:r.phase,rpm:r.cars[0].st.eOmega*9.549, gear:r.cars[0].st.gear, cl:r.cars[0].st.clutch, sh:r.cars[0].st.shiftT, lim:r.cars[0].bc.limiter, lr:r.cars[0].bc.launchRpm}:null})()")
            if st is None: await page.wait_for_timeout(50); continue
            want = st['rpm'] < (st['lr'] if st['ph'] != 'run' else 1e9)
            if st['ph'] in ('staging', 'countdown'):
                if want and not held: await page.mouse.down(); held = True
                if not want and held: await page.mouse.up(); held = False
            elif st['ph'] == 'run':
                if not held: await page.mouse.down(); held = True
                if st['rpm'] > st['lim'] * 0.95 and st['cl'] == 'lock' and st['sh'] == 0: await page.keyboard.press('ArrowRight')
            if st['ph'] == 'countdown' and shots == 0: await page.screenshot(path='shots/05-countdown.png'); shots = 1
            if st['ph'] == 'run' and shots == 1 and st['gear'] >= 2:
                await page.screenshot(path='shots/06-run.png'); shots = 2
                print('AUDIO', await page.evaluate("JSON.stringify({s: BeltAudio.status(), last: BeltAudio._A.last, voices: Object.keys(BeltAudio._A.voices)})"))
            if st['ph'] == 'run' and shots == 2 and st['gear'] >= 4: await page.screenshot(path='shots/07-run2.png'); shots = 3
            await page.wait_for_timeout(16)
        if held: await page.mouse.up()
        await page.wait_for_timeout(2500)
        await page.screenshot(path='shots/08-result.png')
        res = await page.evaluate("({cash: __belt.S.cash, wins: __belt.S.wins, hist: __belt.S.history.slice(-1)})")
        print(json.dumps(res)); print('ERRORS', errs)
        await b.close()
asyncio.run(main())
