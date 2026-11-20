import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { Layout } from './components/Layout';
import { NeedNetwork, Spinner, ToastProvider } from './components/ui';
import Login from './pages/auth/Login';
import type { Role } from './types';

const MyCourses = lazy(() => import('./pages/employee/MyCourses'));
const CourseView = lazy(() => import('./pages/employee/CourseView'));
const MaterialView = lazy(() => import('./pages/employee/MaterialView'));
const TestPlayer = lazy(() => import('./pages/employee/TestPlayer'));
const Results = lazy(() => import('./pages/employee/Results'));
const Library = lazy(() => import('./pages/employee/Library'));
const Assessments = lazy(() => import('./pages/employee/Assessments'));
const Trainer = lazy(() => import('./pages/employee/Trainer'));
const QrTransfer = lazy(() => import('./pages/employee/QrTransfer'));
const MCourses = lazy(() => import('./pages/methodist/Courses'));
const CourseEditor = lazy(() => import('./pages/methodist/CourseEditor'));
const TestBuilder = lazy(() => import('./pages/methodist/TestBuilder'));
const MLibrary = lazy(() => import('./pages/methodist/Library'));
const Assignments = lazy(() => import('./pages/methodist/Assignments'));
const Reviews = lazy(() => import('./pages/methodist/Reviews'));
const Scenarios = lazy(() => import('./pages/methodist/Scenarios'));
const Users = lazy(() => import('./pages/methodist/Imports'));
const Dashboard = lazy(() => import('./pages/manager/DepartmentDashboard'));
const Assessments360 = lazy(() => import('./pages/manager/Assessments360'));
const QrReceive = lazy(() => import('./pages/manager/QrReceive'));
const Reports = lazy(() => import('./pages/reports/Reports'));
const Verify = lazy(() => import('./pages/public/Verify'));

const STAFF: Role[] = ['admin', 'methodist'];
const MGR: Role[] = ['admin', 'methodist', 'manager'];

function Guard({ roles, online, children }: { roles?: Role[]; online?: boolean; children: ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Layout>{online ? <NeedNetwork>{children}</NeedNetwork> : children}</Layout>;
}

function Home() {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'manager') return <Navigate to="/dash" replace />;
  if (user.role === 'employee') return <Navigate to="/my" replace />;
  return <Navigate to="/m/courses" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <BrowserRouter>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/verify/:code" element={<Verify />} />
            <Route path="/" element={<Home />} />
            <Route path="/my" element={<Guard><MyCourses /></Guard>} />
            <Route path="/course/:courseId" element={<Guard><CourseView /></Guard>} />
            <Route path="/course/:courseId/m/:materialId" element={<Guard><MaterialView /></Guard>} />
            <Route path="/course/:courseId/test" element={<Guard><TestPlayer /></Guard>} />
            <Route path="/results" element={<Guard><Results /></Guard>} />
            <Route path="/library" element={<Guard><Library /></Guard>} />
            <Route path="/assess" element={<Guard><Assessments /></Guard>} />
            <Route path="/trainer" element={<Guard><Trainer /></Guard>} />
            <Route path="/trainer/:scenarioId" element={<Guard><Trainer /></Guard>} />
            <Route path="/qr-transfer" element={<Guard><QrTransfer /></Guard>} />
            <Route path="/m/courses" element={<Guard roles={STAFF} online><MCourses /></Guard>} />
            <Route path="/m/courses/:courseId" element={<Guard roles={STAFF} online><CourseEditor /></Guard>} />
            <Route path="/m/courses/:courseId/test" element={<Guard roles={STAFF} online><TestBuilder /></Guard>} />
            <Route path="/m/library" element={<Guard roles={STAFF} online><MLibrary /></Guard>} />
            <Route path="/m/assignments" element={<Guard roles={MGR} online><Assignments /></Guard>} />
            <Route path="/m/reviews" element={<Guard roles={STAFF} online><Reviews /></Guard>} />
            <Route path="/m/scenarios" element={<Guard roles={STAFF} online><Scenarios /></Guard>} />
            <Route path="/m/users" element={<Guard roles={STAFF} online><Users /></Guard>} />
            <Route path="/dash" element={<Guard roles={MGR} online><Dashboard /></Guard>} />
            <Route path="/a360" element={<Guard roles={MGR} online><Assessments360 /></Guard>} />
            <Route path="/qr-receive" element={<Guard roles={MGR} online><QrReceive /></Guard>} />
            <Route path="/reports" element={<Guard roles={MGR} online><Reports /></Guard>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
