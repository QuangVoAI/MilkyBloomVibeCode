import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { House, User, Panda, Package, Tag, Ticket } from 'lucide-react'
import Account from './Account'
import TabBtns from './Tabs/TabBtns'
import SearchField from './SearchField'
import { ADMIN_ROUTES } from '../../../../config/routes'

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const navigationTabs = [
    { 
      icon: <House />, 
      title: 'Dashboard', 
      route: ADMIN_ROUTES.DASHBOARD 
    },
    { 
      icon: <User />, 
      title: 'Users', 
      route: ADMIN_ROUTES.USERS 
    },
    { 
      icon: <Panda />, 
      title: 'Products', 
      route: ADMIN_ROUTES.PRODUCTS 
    },
    { 
      icon: <Package />, 
      title: 'Orders', 
      route: ADMIN_ROUTES.ORDERS 
    },
    {
      icon: <Ticket />,
      title: 'Support Tickets',
      route: ADMIN_ROUTES.SUPPORT_TICKETS,
    },
    { 
      icon: <Tag />, 
      title: 'Discount Codes', 
      route: ADMIN_ROUTES.DISCOUNT_CODES 
    },
  ];

  const handleTabClick = (route) => {
    navigate(route);
  };

  return (
    <div className='overflow-y-auto sticky top-4 h-full custom-scrollbar'>
      <Account />
      <SearchField />
      <TabBtns 
        tabs={navigationTabs}
        activeRoute={location.pathname}
        onTabClick={handleTabClick}
      />
    </div>
  )
}

export default Sidebar
