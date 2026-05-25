import { redirect } from 'next/navigation';

/** Work order list lives on the technician dashboard — canonical entry point. */
export default function TechWorkOrdersIndexPage() {
  redirect('/tech');
}
