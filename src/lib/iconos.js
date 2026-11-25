// Íconos disponibles por nombre para src/menu/*.js (string → componente lucide-react).
// Se importan uno por uno (no `import *`) para que el bundle no cargue los 1400 íconos.
// Si un módulo necesita otro, lo agrega aquí (una línea) o pasa el componente directamente en `icon`.
import {
  LayoutDashboard, Sparkles, CalendarDays, Clock, Users, ClipboardList, Stethoscope, Camera, Footprints, ShieldCheck,
  HeartPulse, FileText, Upload, MessageSquareWarning, Megaphone, Receipt, Package, ArrowRightLeft, ShoppingCart, Truck,
  Tags, Gift, Wallet, Landmark, PiggyBank, TrendingUp, TrendingDown, Scale, CalendarRange, FileBarChart2, BarChart3,
  UserCheck, Percent, Wrench, ClipboardCheck, ScanLine, PackageSearch, QrCode, UserCog, Building2, Settings, CreditCard, History, Video, Mic, FileSignature,
  Home, Bell, Search, Plus, Printer, Download, Activity, Briefcase, Store, LifeBuoy, Gauge, Folder, BookOpen,
} from 'lucide-react'

export const ICONOS = {
  LayoutDashboard, Sparkles, CalendarDays, Clock, Users, ClipboardList, Stethoscope, Camera, Footprints, ShieldCheck,
  HeartPulse, FileText, Upload, MessageSquareWarning, Megaphone, Receipt, Package, ArrowRightLeft, ShoppingCart, Truck,
  Tags, Gift, Wallet, Landmark, PiggyBank, TrendingUp, TrendingDown, Scale, CalendarRange, FileBarChart2, BarChart3,
  UserCheck, Percent, Wrench, ClipboardCheck, ScanLine, PackageSearch, QrCode, UserCog, Building2, Settings, CreditCard, History, Video, Mic, FileSignature,
  Home, Bell, Search, Plus, Printer, Download, Activity, Briefcase, Store, LifeBuoy, Gauge, Folder, BookOpen,
}

/** Acepta un nombre ('Users') o un componente; devuelve siempre un componente. */
export const resolverIcono = icon => (typeof icon === 'string' ? (ICONOS[icon] ?? Folder) : (icon ?? Folder))
