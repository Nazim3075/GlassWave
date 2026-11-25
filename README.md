# GlassWave Standalone PWA

GitHub Pages (`nazim3075.github.io`) এ আপলোড করার জন্য প্রস্তুত ফাইলসমূহ:

1. `index.html` — স্বতন্ত্র অ্যাপ (PWA) মেটা-ট্যাগ ও ইন্টারফেস
2. `app.js` — একাধিক মিউজিক সোর্স (Saavn, JioSaavn Mirror, Monochrome, iTunes) থেকে অটো-ফলব্যাক সার্চ ও প্লেয়ার
3. `manifest.json` — ক্রোমের অ্যাড্রেস বার ছাড়া পূর্ণাঙ্গ অ্যাপ (`display: "standalone"`) হিসেবে চালানোর কনফিগারেশন
4. `sw.js` — Service Worker (ইনস্টলযোগ্য PWA ও অ্যাপ শেল ক্যাশিং)
5. `icon-192.png` ও `icon-512.png` — অ্যাপ আইকন

## গিটহাবে আপলোড ও ব্যবহারের নিয়ম
1. ZIP ফাইলটি আনজিপ করে ভেতরের সব ফাইল আপনার `nazim3075.github.io` রিপোজিটরির রুট ফোল্ডারে আপলোড করুন।
2. ১–২ মিনিট অপেক্ষা করে Chrome-এ `https://nazim3075.github.io` ওপেন করুন।
3. মেনু (`⋮`) থেকে **"Install app"** বা **"Add to Home screen"** সিলেক্ট করুন।
4. হোম স্ক্রিন/অ্যাপ ড্রয়ার থেকে **GlassWave** খুললে আর ক্রোম অ্যাড্রেস বার দেখা যাবে না।
