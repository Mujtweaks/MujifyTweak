// Mujify Tweaks — LibreHardwareMonitor temperature sidecar.
//
// A thin console wrapper around LibreHardwareMonitorLib (MPL 2.0). It prints one
// JSON line per second: {"cpuTempC":<n|null>,"gpuTempC":<n|null>}. The Rust
// SystemMonitor spawns it and merges these into the live system_stats stream.
//
// Published self-contained single-file (see build), so the shipped resources/
// LHMWrapper.exe needs ZERO .NET installed on the end user's PC — same bar as
// PresentMon. CPU temp sensors require the LHM ring0 driver (admin); when run
// unelevated they simply report null, and the app shows an honest "—".

using System.Text.Json;
using LibreHardwareMonitor.Hardware;

class UpdateVisitor : IVisitor
{
    public void VisitComputer(IComputer computer) => computer.Traverse(this);
    public void VisitHardware(IHardware hardware)
    {
        hardware.Update();
        foreach (var sub in hardware.SubHardware) sub.Accept(this);
    }
    public void VisitSensor(ISensor sensor) { }
    public void VisitParameter(IParameter parameter) { }
}

class Program
{
    static bool IsGpu(HardwareType t) =>
        t == HardwareType.GpuNvidia || t == HardwareType.GpuAmd || t == HardwareType.GpuIntel;

    // Prefer a package/overall sensor; otherwise fall back to the hottest core.
    static float? PickTemp(IHardware hw, params string[] preferred)
    {
        float? best = null;
        foreach (var s in hw.Sensors)
        {
            if (s.SensorType != SensorType.Temperature || !s.Value.HasValue) continue;
            foreach (var name in preferred)
            {
                if (s.Name.Contains(name, StringComparison.OrdinalIgnoreCase))
                    return s.Value;
            }
            if (best is null || s.Value > best) best = s.Value; // hottest fallback
        }
        return best;
    }

    static int Main()
    {
        var computer = new Computer { IsCpuEnabled = true, IsGpuEnabled = true };
        try { computer.Open(); }
        catch
        {
            // Can't open (driver blocked / no access) — emit nulls forever so the
            // Rust side degrades honestly rather than the sidecar crashing.
            while (true)
            {
                Console.WriteLine("{\"cpuTempC\":null,\"gpuTempC\":null}");
                Console.Out.Flush();
                Thread.Sleep(1000);
            }
        }

        var visitor = new UpdateVisitor();

        while (true)
        {
            computer.Accept(visitor);
            float? cpu = null, gpu = null;
            foreach (var hw in computer.Hardware)
            {
                if (hw.HardwareType == HardwareType.Cpu)
                    cpu ??= PickTemp(hw, "Package", "Tctl", "Tdie", "Core Max");
                else if (IsGpu(hw.HardwareType))
                    gpu ??= PickTemp(hw, "GPU Core", "Core", "Hot Spot");
            }
            Console.WriteLine(JsonSerializer.Serialize(new { cpuTempC = cpu, gpuTempC = gpu }));
            Console.Out.Flush();
            Thread.Sleep(1000);
        }
    }
}
